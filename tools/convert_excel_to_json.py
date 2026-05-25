#!/usr/bin/env python3
"""
convert_excel_to_json.py
Convertit le fichier Excel des idées de sorties en sites.json

Usage :
    python tools/convert_excel_to_json.py
    python tools/convert_excel_to_json.py --input data/mon_fichier.xlsx --output sites.json
"""

import json
import re
import sys
import argparse
import uuid
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("ERREUR : openpyxl non installé. Lancez : pip install openpyxl")
    sys.exit(1)

# -- Configuration ----------------------------------------------------------
DEFAULT_INPUT = Path('data/100_idees_sorties_weekends_depuis_Uchaud.xlsx')
DEFAULT_OUTPUT = Path('sites.json')
DEFAULT_CSV_GPS = Path('data/coordonnees_a_completer.csv')

# Mapping des noms de colonnes possibles
COLUMN_ALIASES = {
    'destination': ['destination', 'nom', 'lieu', 'site', 'name'],
    'secteur': ['secteur', 'zone', 'region', 'département'],
    'temps_route': ['temps de route', 'trajet', 'durée trajet', 'temps_route', 'temps route'],
    'type_sortie': ['type de sortie', 'type_sortie', 'type', 'catégorie'],
    'programme_court': ['programme court', 'programme_court', 'programme', 'description'],
    'points_forts': ['points forts', 'points_forts', 'avantages', 'atouts'],
    'niveau_marche': ['niveau de marche', 'niveau_marche', 'marche', 'difficulté'],
    'budget_indicatif': ['budget indicatif', 'budget_indicatif', 'budget', 'coût'],
    'vigilance': ['vigilance', 'attention', 'notes', 'remarques'],
    'priorite': ['priorité', 'priorite', 'priority', 'ordre'],
    'selection_perso': ['sélection perso', 'selection_perso', 'sélection', 'choix'],
    'statut': ['statut', 'status', 'état'],
    'lat': ['latitude', 'lat', 'gps_lat'],
    'lon': ['longitude', 'lon', 'lng', 'gps_lon']
}

def slugify(text):
    if not text:
        return ''
    text = str(text).lower().strip()
    text = re.sub(r'[àáâãäå]', 'a', text)
    text = re.sub(r'[èéêë]', 'e', text)
    text = re.sub(r'[ìíîï]', 'i', text)
    text = re.sub(r'[òóôõö]', 'o', text)
    text = re.sub(r'[ùúûü]', 'u', text)
    text = re.sub(r'[ç]', 'c', text)
    text = re.sub(r'[^a-z0-9]+', '_', text)
    return text.strip('_')

def parse_minutes(text):
    if not text:
        return None
    text = str(text).lower()
    h_match = re.search(r'(\d+)\s*h', text)
    m_match = re.search(r'(\d+)\s*m', text)
    total = 0
    if h_match:
        total += int(h_match.group(1)) * 60
    if m_match:
        total += int(m_match.group(1))
    if not h_match and not m_match:
        nums = re.findall(r'\d+', text)
        if nums:
            total = int(nums[0])
    return total if total > 0 else None

def detect_bool(text, keywords):
    if not text:
        return False
    return any(kw.lower() in str(text).lower() for kw in keywords)

def find_column(headers_lower, aliases):
    for alias in aliases:
        for i, h in enumerate(headers_lower):
            if alias in h:
                return i
    return None

def detect_budget_range(text):
    if not text:
        return None, None
    nums = re.findall(r'\d+(?:[.,]\d+)?', str(text).replace(',', '.'))
    nums = [float(n) for n in nums if float(n) < 500]
    if len(nums) >= 2:
        return min(nums), max(nums)
    if len(nums) == 1:
        return nums[0], nums[0]
    return None, None

def convert(input_path, output_path, csv_path):
    print(f"\n{'='*60}")
    print(f"  CONVERSION EXCEL -> JSON")
    print(f"{'='*60}")
    print(f"  Entrée  : {input_path}")
    print(f"  Sortie  : {output_path}")
    print(f"  CSV GPS : {csv_path}")
    print(f"{'='*60}\n")

    if not input_path.exists():
        print(f"ERREUR : fichier introuvable : {input_path}")
        print("Créez d'abord le dossier data/ et copiez-y le fichier Excel.")
        sys.exit(1)

    wb = openpyxl.load_workbook(str(input_path), data_only=True)
    ws = wb.active
    print(f"Feuille active : {ws.title}")

    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        print("ERREUR : feuille vide")
        sys.exit(1)

    # Détection entête
    header_row = rows[0]
    headers = [str(h).strip() if h else '' for h in header_row]
    headers_lower = [h.lower() for h in headers]
    print(f"\nColonnes détectées ({len(headers)}) :")
    for i, h in enumerate(headers):
        print(f"  [{i}] {h}")

    # Mapping colonnes
    col_map = {}
    for field, aliases in COLUMN_ALIASES.items():
        idx = find_column(headers_lower, aliases)
        col_map[field] = idx
        status = f"colonne [{idx}] = '{headers[idx]}'" if idx is not None else "NON TROUVÉE"
        print(f"  {field:25s} -> {status}")

    # Conversion lignes
    sites = []
    gps_missing = []
    stats = {'total': 0, 'gratuit': 0, 'sans_peage': 0, 'avec_gps': 0, 'sans_gps': 0,
             'avec_budget': 0, 'avec_reservation': 0}

    def get_val(row, field):
        idx = col_map.get(field)
        if idx is None or idx >= len(row):
            return None
        v = row[idx]
        return str(v).strip() if v is not None else None

    for i, row in enumerate(rows[1:], 1):
        if not any(row):
            continue
        destination = get_val(row, 'destination')
        if not destination:
            continue

        stats['total'] += 1
        site_id = f"site_{slugify(destination)}_{str(uuid.uuid4())[:6]}"

        # GPS
        lat_raw = get_val(row, 'lat')
        lon_raw = get_val(row, 'lon')
        lat, lon = None, None
        has_gps = False
        try:
            if lat_raw and lon_raw:
                lat = float(lat_raw.replace(',', '.'))
                lon = float(lon_raw.replace(',', '.'))
                if -90 <= lat <= 90 and -180 <= lon <= 180:
                    has_gps = True
        except (ValueError, AttributeError):
            pass

        if has_gps:
            stats['avec_gps'] += 1
        else:
            stats['sans_gps'] += 1
            gps_missing.append({'id': site_id, 'destination': destination,
                                 'secteur': get_val(row, 'secteur') or '', 'lat': '', 'lon': ''})

        # Budget
        budget_text = get_val(row, 'budget_indicatif') or ''
        budget_min, budget_max = detect_budget_range(budget_text)
        if budget_min is not None:
            stats['avec_budget'] += 1

        # Flags économiques
        gratuit = detect_bool(budget_text, ['gratuit', 'libre', 'free', 'gratu'])
        sans_peage = detect_bool(get_val(row, 'vigilance') or '', ['sans péage', 'sans peage'])
        reservation = detect_bool(get_val(row, 'vigilance') or '', ['réservation', 'reservation'])
        if gratuit:
            stats['gratuit'] += 1
        if sans_peage:
            stats['sans_peage'] += 1
        if reservation:
            stats['avec_reservation'] += 1

        # Temps route
        temps_min = parse_minutes(get_val(row, 'temps_route'))

        # Priorité
        priorite_raw = get_val(row, 'priorite')
        priorite = None
        if priorite_raw:
            try:
                priorite = int(float(priorite_raw))
            except ValueError:
                priorite = priorite_raw

        site = {
            'id': site_id,
            'destination': destination,
            'secteur': get_val(row, 'secteur'),
            'temps_route_min': temps_min,
            'type_sortie': get_val(row, 'type_sortie'),
            'programme_court': get_val(row, 'programme_court'),
            'points_forts': get_val(row, 'points_forts'),
            'niveau_marche': get_val(row, 'niveau_marche'),
            'budget_indicatif': budget_text or None,
            'budget_min': budget_min,
            'budget_max': budget_max,
            'vigilance': get_val(row, 'vigilance'),
            'priorite': priorite,
            'selection_perso': detect_bool(get_val(row, 'selection_perso') or '', ['oui', 'yes', 'x', '1', 'true']),
            'statut': get_val(row, 'statut'),
            'gratuit': gratuit,
            'sans_peage': sans_peage,
            'reservation_requise': reservation,
            'lat': lat,
            'lon': lon,
            'has_gps': has_gps
        }
        # Nettoyer None inutiles
        site = {k: v for k, v in site.items() if v is not None and v != ''}
        site['has_gps'] = has_gps  # Toujours inclus
        sites.append(site)

    # Écriture sites.json
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(output_path), 'w', encoding='utf-8') as f:
        json.dump(sites, f, ensure_ascii=False, indent=2)

    # Écriture CSV GPS manquants
    if gps_missing:
        csv_path.parent.mkdir(parents=True, exist_ok=True)
        with open(str(csv_path), 'w', encoding='utf-8') as f:
            f.write('id,destination,secteur,lat,lon\n')
            for g in gps_missing:
                f.write(f"{g['id']},{g['destination']},{g['secteur']},,\n")
        print(f"\nCSV GPS a compléter : {csv_path} ({len(gps_missing)} sites)")

    # Rapport final
    print(f"\n{'='*60}")
    print(f"  RAPPORT DE CONVERSION")
    print(f"{'='*60}")
    print(f"  Sites convertis      : {stats['total']}")
    print(f"  Avec GPS             : {stats['avec_gps']}")
    print(f"  Sans GPS             : {stats['sans_gps']} -> {csv_path.name}")
    print(f"  Gratuits détectés    : {stats['gratuit']}")
    print(f"  Sans péage détectés  : {stats['sans_peage']}")
    print(f"  Avec budget          : {stats['avec_budget']}")
    print(f"  Réservation requise  : {stats['avec_reservation']}")
    print(f"\n  Fichier généré : {output_path}")
    print(f"{'='*60}\n")

    if stats['sans_gps'] > 0:
        print(f"ATTENTION : {stats['sans_gps']} site(s) sans GPS.")
        print(f"   Complétez {csv_path.name} avec les coordonnées (latitude, longitude)")
        print(f"   puis relancez ce script ou saisissez-les dans l'application.\n")

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convertit le fichier Excel des sorties en sites.json')
    parser.add_argument('--input', type=Path, default=DEFAULT_INPUT, help='Chemin fichier Excel')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT, help='Fichier JSON de sortie')
    parser.add_argument('--csv', type=Path, default=DEFAULT_CSV_GPS, help='CSV GPS à compléter')
    args = parser.parse_args()
    convert(args.input, args.output, args.csv)
