Feature: VS Code Sidebar Agent Status
  As a Pennyfarthing user
  I want to see agent status in a VS Code sidebar panel
  So that I can monitor orchestration state without leaving my editor

  Background:
    Given the Pennyfarthing extension is activated
    And the WheelHub server is running

  # AC1: Sidebar panel appears in VS Code activity bar when extension active
  @AC1
  Scenario: Sidebar panel registers in activity bar
    When the extension activates
    Then a view container "pennyfarthing" should be registered in the activity bar
    And a tree view "pennyfarthing.agentStatus" should be registered
    And the activity bar icon should be visible

  @AC1
  Scenario: Sidebar shows empty state when no agent active
    Given no agent is currently active
    When I open the Pennyfarthing sidebar
    Then I should see the message "No agent active. Run /dev or /sm to start."

  # AC2: Agent section shows current agent name and persona character
  @AC2
  Scenario: Agent section displays persona information
    Given an agent "dev" is active with persona:
      | character | Tyrion Lannister |
      | theme     | game-of-thrones  |
      | role      | dev              |
    When I view the Agent section in the sidebar
    Then I should see a tree item with label "Agent: Tyrion Lannister"
    And the item description should be "DEV"
    And the item should have contextValue "agent"

  @AC2
  Scenario: Agent section shows context percentage
    Given an agent is active with context usage at 45%
    When I view the Agent section in the sidebar
    Then I should see a child item showing "Context: 45%"
    And the context indicator should be green (safe level)

  @AC2
  Scenario: Context indicator shows warning levels
    Given an agent is active with context usage at 72%
    When I view the Agent section in the sidebar
    Then the context indicator should be orange (warning level)

  @AC2
  Scenario: Context indicator shows critical levels
    Given an agent is active with context usage at 87%
    When I view the Agent section in the sidebar
    Then the context indicator should be red (critical level)

  # AC3: Sprint section shows points remaining and in-progress story count
  @AC3
  Scenario: Sprint section displays points remaining
    Given the current sprint has 21 total points
    And 13 points have been completed
    When I view the Sprint section in the sidebar
    Then I should see a tree item with label "Sprint"
    And the item description should be "8/21 pts"
    And the item should have contextValue "sprint"

  @AC3
  Scenario: Sprint section shows in-progress count
    Given 2 stories are currently in-progress
    When I expand the Sprint section
    Then I should see a child item "In Progress: 2 stories"

  @AC3
  Scenario: Sprint section empty when no sprint active
    Given no sprint is currently active
    When I view the Sprint section in the sidebar
    Then I should see the message "No active sprint"

  # AC4: Story section shows active story ID, title, phase, and branch
  @AC4
  Scenario: Story section displays active story details
    Given an active story with:
      | id     | MSSCI-12048                       |
      | title  | Sidebar panel with agent status   |
      | phase  | bdd                               |
      | branch | feat/MSSCI-12048-vscode-sidebar   |
      | points | 3                                 |
    When I view the Story section in the sidebar
    Then I should see a tree item with label "MSSCI-12048"
    And the item description should be "bdd • 3 pts"
    And the item tooltip should contain "Sidebar panel with agent status"
    And the item should have contextValue "story"

  @AC4
  Scenario: Story item has click command to open Jira
    Given an active story with id "MSSCI-12048"
    When I click on the story item
    Then the command "pennyfarthing.openJira" should be invoked with "MSSCI-12048"

  @AC4
  Scenario: Story section shows phase with appropriate icon
    Given an active story in phase "bdd"
    When I view the Story section
    Then the story item should display a blue test tube icon for BDD phase

  @AC4
  Scenario: Story section empty when no active story
    Given no story is currently active
    When I view the Story section in the sidebar
    Then I should see the message "No active story. Use /work to start."

  # AC5: Quick actions provide commands to switch agent and view backlog
  @AC5
  Scenario: Quick actions section displays available commands
    When I view the Quick Actions section in the sidebar
    Then I should see action items:
      | label        | command                     |
      | Switch Agent | pennyfarthing.switchAgent   |
      | View Backlog | pennyfarthing.viewBacklog   |
      | Start Work   | pennyfarthing.startWork     |
      | Refresh      | pennyfarthing.refresh       |

  @AC5
  Scenario: Switch Agent command shows quick pick
    When I execute the "Switch Agent" action
    Then a quick pick should appear with options:
      | label                                  |
      | /sm - Scrum Master                     |
      | /tea - Test Engineer                   |
      | /dev - Developer                       |
      | /reviewer - Code Reviewer              |

  @AC5
  Scenario: View Backlog command opens backlog view
    When I execute the "View Backlog" action
    Then the sprint backlog should be displayed

  @AC5
  Scenario: Refresh command updates tree data
    When I execute the "Refresh" action
    Then the tree view should refresh with latest data

  # AC6: Data updates in real-time via WheelHub WebSocket
  @AC6
  Scenario: Sidebar updates when agent changes
    Given the sidebar is displaying agent "sm" with character "Lord Varys"
    When the agent changes to "dev" with character "Tyrion Lannister"
    Then the Agent section should update to show "Agent: Tyrion Lannister"
    And the description should change to "DEV"

  @AC6
  Scenario: Sidebar updates when context percentage changes
    Given the sidebar is displaying context at 30%
    When the context usage increases to 55%
    Then the context indicator should update to 55%
    And the indicator color should change to yellow

  @AC6
  Scenario: Sidebar updates when story phase changes
    Given the sidebar is displaying story in phase "bdd"
    When the story phase changes to "impl"
    Then the story description should update to show "impl"
    And the phase icon should change to green code icon

  @AC6
  Scenario: Sidebar handles WebSocket disconnection
    Given the sidebar is connected to WheelHub
    When the WebSocket connection is lost
    Then the sidebar should show "Connecting to WheelHub..."
    And automatic reconnection should be attempted

  @AC6
  Scenario: Sidebar reconnects and restores state
    Given the WebSocket was disconnected
    When the connection is re-established
    Then the sidebar should update with current state
    And the "Connecting" message should be removed

  # Edge cases from UX spec
  @edge-case
  Scenario: Extension activated before agent starts
    Given the extension is activated
    But no agent has been started yet
    When I open the sidebar
    Then I should see empty states for Agent and Story sections
    And the Sprint section should still show sprint data if available

  @edge-case
  Scenario: Theme changes mid-session
    Given an agent "dev" is displaying with theme "game-of-thrones"
    When the theme is changed to "star-trek"
    Then the Agent section should update with new character name
    And no error should occur during the transition

  # Accessibility requirements
  @a11y
  Scenario: Tree items have accessible labels
    Given an agent "dev" with character "Tyrion Lannister" at 45% context
    When a screen reader accesses the Agent item
    Then the accessible description should be "Agent Tyrion Lannister, role Developer, context 45 percent"

  @a11y
  Scenario: Keyboard navigation works for all items
    When I focus the sidebar tree view
    Then I should be able to navigate with arrow keys
    And I should be able to expand/collapse with Enter
    And I should be able to activate actions with Space
