#!/usr/bin/env python3
import csv, sys, openpyxl

SRC = "/Users/emiliocasella/Downloads/infoproviderdata (3).xlsx"
OUT = "db/data/fornitori.csv"
SHEET = "Esportazione SAPUI5"

wb = openpyxl.load_workbook(SRC, read_only=True, data_only=True)
ws = wb[SHEET]
rows = list(ws.iter_rows(values_only=True))
rows = [r for r in rows if any(c is not None and str(c).strip() for c in r)]
header = rows[0]
data = rows[1:]
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, delimiter=";")
    w.writerow([str(c).strip() for c in header])
    for r in data:
        w.writerow(["" if c is None else str(c).strip() for c in r[:13]])
print(f"header={len(header)} rows={len(data)} -> {OUT}")
