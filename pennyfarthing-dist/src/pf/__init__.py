"""
Pennyfarthing Scripts - Python utilities for agent orchestration.

Modules:
    config: Project root detection, YAML configuration loading
    output: Colored console output utilities (success, info, warn, error)
    sprint: Sprint YAML parsing and story access
    jira: Jira CLI wrapper and JiraClient for REST API operations
    jira_sync: Async epic sync to Jira
    jira_sync_story: Single story sync to Jira
    jira_epic_creation: Create Jira epics from sprint YAML
    jira_bidirectional_sync: Bidirectional sync between sprint YAML and Jira
    preflight: Async preflight checks for workflow completion
    swebench: SWE-bench patch parsing and scenario utilities
"""

__version__ = "12.5.0"
