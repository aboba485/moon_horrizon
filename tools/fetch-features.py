#!/usr/bin/env python3
"""Fetch the official IAU/USGS Moon KMZ and retain large or south-polar features.

Uses only Python's standard library. Output is an offline build intermediate under
ignored data/, never requested by the browser. Next run: node tools/build-features.mjs
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone

URL = 'https://asc-planetarynames-data.s3.us-west-2.amazonaws.com/MOON_nomenclature_center_pts.kmz'
SOURCE = 'https://planetarynames.wr.usgs.gov/GIS_Downloads'
DATA = Path(__file__).resolve().parent.parent / 'data' / 'nomenclature'

def build(archive):
    with zipfile.ZipFile(archive) as z:
        root = ET.fromstring(z.read('MOON_nomenclature_center_pts.kml'))
    ns = {'k': 'http://www.opengis.net/kml/2.2'}
    features = []
    for placemark in root.findall('.//k:Placemark', ns):
        fields = {p.attrib['name']: p.text for p in placemark.findall('.//k:SimpleData', ns)}
        if fields.get('approval') != 'Adopted by IAU':
            continue
        lat, lon, diameter = (float(fields[k]) for k in ('center_lat', 'center_lon', 'diameter'))
        if lat > -75 and diameter < 150:
            continue
        code = fields.get('code', '')
        kind = {'AA': 'crater', 'SF': 'crater', 'MO': 'mons', 'VA': 'vallis',
                'MA': 'mare', 'OC': 'oceanus', 'SI': 'sinus', 'RI': 'rima',
                'RU': 'rupes', 'DO': 'dorsum', 'LC': 'lacus', 'PA': 'palus'}.get(code,
                fields.get('type', '').split(',')[0].lower())
        features.append(dict(name=placemark.findtext('k:name', namespaces=ns).strip(), kind=kind,
                             lat=lat, lon=round((lon + 180) % 360 - 180, 6), diamKm=round(diameter, 3),
                             id=int(fields['link'].rstrip('/').split('/')[-1])))
    features.sort(key=lambda f: f['name'])
    return dict(meta=dict(source=SOURCE, download=URL, sourceSha256=hashlib.sha256(archive.read_bytes()).hexdigest(),
                         count=len(features), generated=datetime.now(timezone.utc).date().isoformat(),
                         filter='IAU adopted; diameter >=150 km OR latitude <=-75 degrees; includes polar satellite craters',
                         coordinates='east-positive, planetocentric; LOLA 2011 control network'), features=features)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, help='Use an already downloaded official KMZ')
    args = parser.parse_args()
    DATA.mkdir(parents=True, exist_ok=True)
    archive = args.input or DATA / 'MOON_nomenclature_center_pts.kmz'
    if args.input is None:
        with urllib.request.urlopen(URL, timeout=90) as response:
            archive.write_bytes(response.read())
    result = build(archive)
    output = DATA / 'features.json'
    output.write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8')
    print(f"{result['meta']['count']} IAU features -> {output}")

if __name__ == '__main__':
    main()
