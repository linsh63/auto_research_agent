#!/usr/bin/env python3
"""Frozen CIFAR H-stage baseline/AugMix exploration and confirmation runner."""
from __future__ import annotations
import argparse, hashlib, json, os, random, time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from torch import nn
from torch.utils.checkpoint import checkpoint
from torch.utils.data import DataLoader, Dataset
from torchvision import models, transforms

MEAN=(0.4914,0.4822,0.4465);STD=(0.2470,0.2435,0.2616)
class ArrayDataset(Dataset):
    def __init__(self,images,labels,indices=None,train=False,augmix=False):
        self.images=np.load(images,mmap_mode="r");self.labels=np.load(labels,mmap_mode="r");self.indices=np.arange(len(self.labels)) if indices is None else np.asarray(indices);self.train=train;self.augmix=augmix
        self.base=transforms.Compose([transforms.RandomCrop(32,padding=4),transforms.RandomHorizontalFlip()])
        self.finish=transforms.Compose([transforms.ToTensor(),transforms.Normalize(MEAN,STD)])
        self.mix=transforms.AugMix(severity=3,mixture_width=3,chain_depth=-1,alpha=1.0,all_ops=True)
    def __len__(self):return len(self.indices)
    def __getitem__(self,i):
        j=int(self.indices[i]);image=Image.fromarray(np.asarray(self.images[j]));label=int(self.labels[j])
        if not self.train:return self.finish(image),label
        image=self.base(image)
        if self.augmix:return (self.finish(image),self.finish(self.mix(image)),self.finish(self.mix(image))),label
        return self.finish(image),label

def seed_all(seed):
    random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.cuda.manual_seed_all(seed);torch.backends.cudnn.enabled=False;torch.backends.cudnn.benchmark=False;torch.backends.cudnn.deterministic=True
def network():
    model=models.resnet18(weights=None,num_classes=10);model.conv1=nn.Conv2d(3,64,3,1,1,bias=False);model.maxpool=nn.Identity();return model
def evaluate(model,loader,device):
    model.eval();correct=total=0;conf=[];hits=[]
    with torch.no_grad():
        for x,y in loader:
            logits=model(x.to(device));prob=logits.softmax(1);pred=prob.argmax(1);y=y.to(device);correct+=int((pred==y).sum());total+=len(y);conf.extend(prob.max(1).values.cpu().tolist());hits.extend((pred==y).float().cpu().tolist())
    confidence=np.asarray(conf);accuracy=np.asarray(hits);ece=0.0
    for lo,hi in zip(np.linspace(0,1,16)[:-1],np.linspace(0,1,16)[1:]):
        mask=(confidence>lo)&(confidence<=hi)
        if mask.any():ece+=float(mask.mean()*abs(accuracy[mask].mean()-confidence[mask].mean()))
    return {"accuracy":correct/total,"ece":ece,"n":total}
def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        for chunk in iter(lambda:f.read(1<<20),b""):h.update(chunk)
    return h.hexdigest()
def main():
    torch.multiprocessing.set_start_method("spawn",force=True)
    torch.set_num_threads(4);torch.set_num_interop_threads(2)
    p=argparse.ArgumentParser();p.add_argument("--data",type=Path,required=True);p.add_argument("--variant",choices=["baseline","augmix"],required=True);p.add_argument("--seed",type=int,choices=[11,23,47],required=True);p.add_argument("--epochs",type=int,default=12);p.add_argument("--output",type=Path,required=True);p.add_argument("--confirmation",action="store_true");p.add_argument("--checkpoint",type=Path);a=p.parse_args()
    if a.epochs!=12:raise SystemExit("frozen protocol requires exactly 12 epochs")
    seed_all(a.seed);device=torch.device("cuda:0");split=np.random.default_rng(42).permutation(50000);train_idx,val_idx=split[:45000],split[45000:]
    train=ArrayDataset(a.data/"train-images.npy",a.data/"train-labels.npy",train_idx,True,a.variant=="augmix")
    val=ArrayDataset(a.data/"train-images.npy",a.data/"train-labels.npy",val_idx)
    loaders={"validation":DataLoader(val,256,False,num_workers=0,pin_memory=True)}
    prefix="confirmation" if a.confirmation else "exploration"
    group_names=["clean-test","gaussian_noise-severity3","contrast-severity3"] if a.confirmation else ["brightness-severity3","defocus_blur-severity3"]
    for name in group_names:
        loaders[name]=DataLoader(ArrayDataset(a.data/f"{name}-images.npy",a.data/f"{name}-labels.npy"),256,False,num_workers=0,pin_memory=True)
    model=network().to(device);start=time.time()
    if a.confirmation:
        if not a.checkpoint:raise SystemExit("confirmation requires the frozen exploration checkpoint")
        saved=torch.load(a.checkpoint,map_location=device,weights_only=True)
        if saved["variant"]!=a.variant or saved["seed"]!=a.seed or saved["epochs"]!=a.epochs:raise SystemExit("checkpoint lineage does not match frozen confirmation request")
        model.load_state_dict(saved["state_dict"]);checkpoint_path=a.checkpoint
    else:
        optimizer=torch.optim.SGD(model.parameters(),lr=.1,momentum=.9,weight_decay=5e-4,nesterov=True);scheduler=torch.optim.lr_scheduler.CosineAnnealingLR(optimizer,T_max=a.epochs)
        for epoch in range(a.epochs):
            model.train()
            for x,y in DataLoader(train,128,True,num_workers=0,pin_memory=True,generator=torch.Generator().manual_seed(a.seed+epoch)):
                optimizer.zero_grad(set_to_none=True);y=y.to(device)
                if a.variant=="augmix":
                    clean,aug1,aug2=(part.to(device) for part in x);logits=[checkpoint(model,part,use_reentrant=False) for part in (clean,aug1,aug2)];ce=nn.functional.cross_entropy(logits[0],y);probs=[item.softmax(1) for item in logits];mean=torch.clamp(sum(probs)/3,1e-7,1).log();js=sum(nn.functional.kl_div(mean,torch.clamp(prob,1e-7,1),reduction="batchmean") for prob in probs)/3;loss=ce+12*js
                else:loss=nn.functional.cross_entropy(model(x.to(device)),y)
                loss.backward();optimizer.step()
            scheduler.step()
            print(json.dumps({"epoch":epoch+1,"epochs":a.epochs,"variant":a.variant,"seed":a.seed}),flush=True)
        a.output.parent.mkdir(parents=True,exist_ok=True);checkpoint_path=a.output.with_suffix(".pt");torch.save({"state_dict":model.state_dict(),"variant":a.variant,"seed":a.seed,"epochs":a.epochs},checkpoint_path)
    metrics={name:evaluate(model,loader,device) for name,loader in loaders.items()};a.output.parent.mkdir(parents=True,exist_ok=True)
    result={"phase":prefix,"variant":a.variant,"seed":a.seed,"epochs":a.epochs,"metrics":metrics,"wallSeconds":time.time()-start,"gpu":torch.cuda.get_device_name(0),"torch":torch.__version__,"checkpoint":str(checkpoint_path),"checkpointSha256":sha256(checkpoint_path),"dataManifestSha256":sha256(a.data/"manifest.json")};a.output.write_text(json.dumps(result,indent=2)+"\n");print(json.dumps(result))
if __name__=="__main__":main()
