#!/usr/bin/env python3
"""Decode only the unsealed H-stage parquet roles into deterministic NumPy arrays."""
from __future__ import annotations
import argparse, io, json, hashlib
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
from PIL import Image

def sha256(path: Path) -> str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda:f.read(1<<20),b""): h.update(chunk)
    return h.hexdigest()

def convert(source: Path, images_out: Path, labels_out: Path) -> dict:
    table=pq.read_table(source)
    image_col="img" if "img" in table.column_names else "image"
    records=table[image_col].to_pylist(); labels=np.asarray(table["label"].to_numpy(),dtype=np.int64)
    images=np.empty((len(records),32,32,3),dtype=np.uint8)
    for i,record in enumerate(records):
        with Image.open(io.BytesIO(record["bytes"])) as image: images[i]=np.asarray(image.convert("RGB"),dtype=np.uint8)
    images_out.parent.mkdir(parents=True,exist_ok=True);np.save(images_out,images,allow_pickle=False);np.save(labels_out,labels,allow_pickle=False)
    return {"source":str(source),"sourceSha256":sha256(source),"rows":len(labels),"images":str(images_out),"imagesSha256":sha256(images_out),"labels":str(labels_out),"labelsSha256":sha256(labels_out)}

def main() -> None:
    parser=argparse.ArgumentParser();parser.add_argument("--root",type=Path,default=Path(".research-data/cases/cifar-h/data"));args=parser.parse_args()
    out=args.root/"prepared"/"exploration"
    items=[("train",args.root/"cifar10-train.parquet"),("brightness-severity3",args.root/"exploration/brightness-severity3.parquet"),("defocus_blur-severity3",args.root/"exploration/defocus_blur-severity3.parquet")]
    manifest={name:convert(path,out/f"{name}-images.npy",out/f"{name}-labels.npy") for name,path in items}
    manifest["split"]={"algorithm":"numpy.default_rng(42).permutation(50000)","trainRows":45000,"validationRows":5000}
    path=out/"manifest.json";path.write_text(json.dumps(manifest,indent=2)+"\n");print(path)
if __name__=="__main__": main()
