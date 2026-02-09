# Django-10973 Control Baselines - Results Summary

## Scenario Details
- **Issue**: Use subprocess.run and PGPASSWORD for client in postgres backend (MEDIUM difficulty)
- **Repository**: django/django
- **Commit**: ddb293685235
- **Difficulty**: MEDIUM
- **Evaluation Rubric**: Solo (Correctness 25%, Depth 25%, Quality 25%, Persona 25%)
- **Model**: claude-haiku-4-5-20251001

## Baseline Runs Results

| Run # | Timestamp | Agent Output | Judge Output | Score | Status |
|-------|-----------|--------------|--------------|-------|--------|
| 1 | 20260102T135203_614 | run_20260102T135203_614.json | judge_20260102T135203_614.json | 69/100 | Complete |
| 2 | 20260102T135208_521 | run_20260102T135208_521.json | judge_20260102T135208_521.json | 80/100 | Complete |
| 3 | 20260102T135213_721 | run_20260102T135213_721.json | judge_20260102T135213_721.json | 86/100 | Complete |

## Score Breakdown

### Run 1: Score 69/100
**Key Issue**: Fundamental correctness problem
- **Correctness**: 15/25 - Claimed feature already implemented, hallucinating entire codebase
- **Depth**: 18/25 - Good structure but based on false premise
- **Quality**: 16/25 - Well-organized but factually incorrect
- **Persona**: 20/25 - Good professional tone

**Summary**: Response demonstrates structural competence but fails on fundamental correctness. Model appears to have hallucinated the implementation details rather than analyzing the actual codebase.

### Run 2: Score 80/100
**Key Strength**: Correct technical analysis
- **Correctness**: 22/25 - Properly identified subprocess.Popen with .pgpass current approach
- **Depth**: 21/25 - Good analysis of problems and solutions with test examples
- **Quality**: 19/25 - Clear examples but cluttered with inappropriate tool invocations
- **Persona**: 18/25 - Professional but tool-use attempts detract

**Summary**: Strong technical analysis with correct problem identification. Presentation issues from attempting to verify codebase during response.

### Run 3: Score 86/100
**Key Strength**: Comprehensive and accurate analysis
- **Correctness**: 23/25 - Accurately identifies issue and proposes correct solution
- **Depth**: 22/25 - Comprehensive with specific test examples and edge case consideration
- **Quality**: 20/25 - Professional, clear structure, complete code examples
- **Persona**: 21/25 - Excellent senior developer voice and pragmatism

**Summary**: Excellent technical analysis with correct understanding and well-reasoned solution demonstrating strong software engineering principles.

## Overall Statistics
- **Average Score**: 78.3/100
- **Highest Score**: 86/100 (Run 3)
- **Lowest Score**: 69/100 (Run 1)
- **Standard Deviation**: ~8.5 points

## Key Observations

1. **Consistency**: Scores range from 69-86, showing variable performance across runs
2. **Correctness**: Only runs 2 and 3 correctly identified the actual codebase state
3. **Run 3 Excellence**: Most consistent high performance across all rubric dimensions
4. **Technical Quality**: All runs demonstrated reasonable code analysis ability when they understood the problem
5. **Environment Handling**: Run 2 showed confusion with tool invocation within response context

## Files Location
All results stored in: `/Users/keithavery/Projects/pennyfarthing/results/baselines/django-10973/dev/runs/`
