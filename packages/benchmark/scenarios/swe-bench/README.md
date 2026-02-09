# SWE-bench Verified Scenarios

External benchmark imported from [princeton-nlp/SWE-bench_Verified](https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified).

## Source

SWE-bench is a benchmark developed by Princeton that evaluates language models on real-world GitHub issue resolution. SWE-bench Verified is a curated subset of 500 human-validated problems.

## Difficulty Mapping

| SWE-bench Label | Pennyfarthing Difficulty | Count |
|-----------------|-------------------------|-------|
| `<15 min fix` | easy | 194 |
| `15 min - 1 hour` | medium | 261 |
| `1-4 hours` | hard | 42 |
| `>4 hours` | extreme | 3 |

## Repository Distribution

- django/django: 231
- sympy/sympy: 75
- sphinx-doc/sphinx: 44
- matplotlib/matplotlib: 34
- scikit-learn/scikit-learn: 32
- astropy/astropy: 22
- pydata/xarray: 22
- pytest-dev/pytest: 19
- pylint-dev/pylint: 10
- psf/requests: 8

## Imported Subset

We import a representative subset stratified by:
1. Difficulty level (covering all 4 bands)
2. Repository diversity (multiple projects)
3. Problem type variety

## Evaluation Modes

### Mode 1: LLM-as-Judge (Default)
Evaluates the proposed solution approach without executing code.
Uses our standard scoring rubric adapted for bug-fix scenarios.

### Mode 2: Full Harness (Advanced)
Requires Docker and the SWE-bench evaluation harness.
Executes actual tests against generated patches.

## Citation

```bibtex
@inproceedings{jimenez2024swebench,
  title={SWE-bench: Can Language Models Resolve Real-world Github Issues?},
  author={Jimenez, Carlos E and Yang, John and Wettig, Alexander and Yao, Shunyu and Pei, Kexin and Press, Ofir and Narasimhan, Karthik},
  booktitle={ICLR},
  year={2024}
}
```
