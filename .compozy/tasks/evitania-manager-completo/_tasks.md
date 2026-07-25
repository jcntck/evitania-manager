---
schema_version: "compozy.tasks/v2"
workflow: evitania-manager-completo
graph:
  nodes:
    - id: task_01
      file: task_01.md
    - id: task_02
      file: task_02.md
    - id: task_03
      file: task_03.md
    - id: task_04
      file: task_04.md
    - id: task_05
      file: task_05.md
    - id: task_06
      file: task_06.md
    - id: task_07
      file: task_07.md
  edges:
    - from: task_01
      to: task_02
    - from: task_01
      to: task_04
    - from: task_02
      to: task_03
    - from: task_02
      to: task_05
    - from: task_04
      to: task_05
    - from: task_03
      to: task_06
    - from: task_05
      to: task_06
    - from: task_06
      to: task_07
---

# Complete Evitania Manager Task List

Seven robust vertical slices implement the complete PRD and TechSpec. Dependency
relationships are defined exclusively in the graph frontmatter.

| ID | Title | Type | Complexity | Assigned tests |
|---|---|---|---|---:|
| `task_01` | Schema v2, migrations, seed, and revisioned repository | backend | critical | 9 UT, 7 IT |
| `task_02` | Catalog invariants, references, and production cycles | backend | high | 9 UT, 1 IT |
| `task_03` | Planning engine, consolidation, estimates, and credits | backend | critical | 22 UT, 3 IT |
| `task_04` | Desktop trust boundary, managed images, IPC, and AppStore | backend | critical | 10 UT, 6 IT, 2 E2E |
| `task_05` | Modular catalog renderer and relational editing | frontend | high | 4 UT, 2 IT, 4 E2E |
| `task_06` | Planner renderer, navigation, accessibility, and scale | frontend | critical | 2 UT, 5 E2E |
| `task_07` | Debian/NSIS distribution and verifiable releases | infra | critical | 4 UT, 2 IT, 3 E2E |
