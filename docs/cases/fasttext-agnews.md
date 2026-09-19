# 真实案例：fastText 词 n-gram 对照

## 来源与边界

研究对象是 Joulin 等人的 [*Bag of Tricks for Efficient Text Classification*](https://arxiv.org/abs/1607.01759)。使用 [fastText v0.9.2 官方实现](https://github.com/facebookresearch/fastText/tree/v0.9.2)和其 [Table 1 复现脚本](https://github.com/facebookresearch/fastText/blob/main/classification-results.sh)列出的 AG News CSV 数据。下载和预处理由 `scripts/prepare_fasttext_agnews.py` 完成，输入归档及转换结果的 SHA-256 记录在本地 `manifest.json`。原始数据和模型保存在忽略版本控制的 `.research-data/`；AG News 数据说明限定研究及其他非商业用途。

本实验是**方法级缩小复现**，不声称复现论文表格中的绝对分数。与论文脚本相比，固定单线程以提高确定性，将 `bucket` 从 10,000,000 缩为 1,000,000，预处理在 Python 中按 CSV 字段完成，并仅比较 AG News。数据仍使用完整公开训练集 120,000 条和测试集 7,600 条。

## 预先确定的实验设计

- 问题：加入词 bigram 是否提高 AG News 分类准确率？
- 唯一处理因素：`wordNgrams=1`（基线）与 `wordNgrams=2`（候选）。其余训练参数、训练集、测试集与评估代码相同。
- 每个处理使用相同的三个 fastText 随机种子：11、23、47；单线程训练。比较配对种子下的准确率差。实验单位是**一次模型训练**，不是 7,600 条测试新闻。
- 指标：固定 AG News 测试集上的 top-1 accuracy，逐种子记录正确数/总数，主要汇总为三个训练种子的平均准确率。
- 判据：候选平均准确率高于基线时，记为在本设置下支持假设；否则记为不支持。无论结果如何都保留。三个种子和一个固定测试集不足以作普遍效果或论文原始结果的强统计结论。
- 资源边界：每个变体最多 600 秒，三个种子顺序执行，每次 fastText 训练最多 360 秒；六次训练总计两次变体命令。模型调用上限 6 次。

本方案在运行测试集之前写定，不依据测试分数调参。论文新颖性不在本次评估范围；本案例用于检验 agent 的可追溯科研 pipeline。

## 运行

```bash
HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890 npm run prepare:fasttext
python3 examples/fasttext-agnews/experiment.py baseline
python3 examples/fasttext-agnews/experiment.py candidate
```

代理地址只是当前机器的下载设置，其他环境可使用正常网络或已有的、哈希一致的归档。完整 agent 流程见根目录 README；`examples/fasttext-agnews/brief.json` 提供任务输入。代码、数据、二进制与预测文件的哈希用于复现检查。
