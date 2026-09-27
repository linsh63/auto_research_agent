#!/usr/bin/env python3
"""Data-steward step run only after the one-time confirmation capability is consumed."""
from __future__ import annotations
import hashlib, io, json
from pathlib import Path
from urllib.request import urlopen
import numpy as np
import pyarrow.parquet as pq
from PIL import Image

ROOT=Path(".research-data/cases/cifar-h");RAW=ROOT/"data/confirmation-raw";OUT=ROOT/"capability/confirmation"
REV="0f57314bbe937783522f1d348758ca2367ed09a9c"
URLS={
 "gaussian_noise-severity3":f"https://huggingface.co/datasets/WNJXYK/TTA-CIFAR-10-C/resolve/{REV}/data/gaussian_noise/severity_3/data-00000.parquet",
 "contrast-severity3":f"https://huggingface.co/datasets/WNJXYK/TTA-CIFAR-10-C/resolve/{REV}/data/contrast/severity_3/data-00000.parquet",
}
def sha(path):
 h=hashlib.sha256()
 with open(path,"rb") as f:
  for chunk in iter(lambda:f.read(1<<20),b""):h.update(chunk)
 return h.hexdigest()
def download(url,path):
 path.parent.mkdir(parents=True,exist_ok=True)
 if path.exists():return
 with urlopen(url,timeout=300) as response,path.open("wb") as out:
  while chunk:=response.read(1<<20):out.write(chunk)
def convert(source,name):
 table=pq.read_table(source);col="img" if "img" in table.column_names else "image";records=table[col].to_pylist();labels=np.asarray(table["label"].to_numpy(),dtype=np.int64);images=np.empty((len(labels),32,32,3),dtype=np.uint8)
 for i,record in enumerate(records):
  with Image.open(io.BytesIO(record["bytes"])) as image:images[i]=np.asarray(image.convert("RGB"),dtype=np.uint8)
 OUT.mkdir(parents=True,exist_ok=True);ip=OUT/f"{name}-images.npy";lp=OUT/f"{name}-labels.npy";np.save(ip,images,allow_pickle=False);np.save(lp,labels,allow_pickle=False)
 return {"source":str(source),"sourceSha256":sha(source),"rows":len(labels),"imagesSha256":sha(ip),"labelsSha256":sha(lp)}
def main():
 if not (ROOT/"confirmation-capability.json").exists():raise SystemExit("confirmation capability has not been consumed")
 source_clean=ROOT/"data/cifar10-test.parquet";items={"clean-test":source_clean}
 for name,url in URLS.items():path=RAW/f"{name}.parquet";download(url,path);items[name]=path
 manifest={"datasetRevisions":{"cifar10":"uoft-cs/cifar10@0b2714987fa478483af9968de7c934580d0bb9a2","cifar10c":f"WNJXYK/TTA-CIFAR-10-C@{REV}"},"files":{name:convert(path,name) for name,path in items.items()}}
 (OUT/"manifest.json").write_text(json.dumps(manifest,indent=2)+"\n");print(OUT/"manifest.json")
if __name__=="__main__":main()
