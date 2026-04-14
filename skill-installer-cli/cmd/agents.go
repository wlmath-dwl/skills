package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"golang.org/x/term"
)

type Agent struct {
	Name     string
	SkillDir string
}

var agents = []Agent{
	{Name: "kiro", SkillDir: ".kiro/skills"},
	{Name: "claude", SkillDir: ".claude/skills"},
	{Name: "codex", SkillDir: ".codex/skills"},
	{Name: "cursor", SkillDir: ".cursor/skills"},
}

// promptSelectAgents shows an interactive selector.
// Up/Down to move cursor, Tab/Space to toggle, Enter to confirm.
func promptSelectAgents() ([]Agent, error) {
	fd := int(os.Stdin.Fd())
	old, err := term.MakeRaw(fd)
	if err != nil {
		return nil, err
	}
	defer term.Restore(fd, old)

	cursor := 0
	checked := make([]bool, len(agents))

	render := func() {
		// move to top of list area and clear
		fmt.Print("\r\033[J")
		fmt.Print("选择 Agent (↑↓移动  Tab/空格切换  Enter确认):\r\n")
		for i, a := range agents {
			mark := "[ ]"
			if checked[i] {
				mark = "[✓]"
			}
			prefix := "  "
			if i == cursor {
				prefix = "> "
			}
			fmt.Printf("%s%s %s  (%s)\r\n", prefix, mark, a.Name, a.SkillDir)
		}
	}

	render()
	buf := make([]byte, 3)
	for {
		n, err := os.Stdin.Read(buf)
		if err != nil {
			return nil, err
		}
		// move cursor up to re-render
		fmt.Printf("\033[%dA", len(agents)+1)

		switch {
		case n == 1 && buf[0] == '\r': // Enter
			var sel []Agent
			for i, c := range checked {
				if c {
					sel = append(sel, agents[i])
				}
			}
			if len(sel) == 0 {
				sel = agents
			}
			render()
			fmt.Print("\r\n")
			return sel, nil
		case n == 1 && buf[0] == '\t': // Tab
			checked[cursor] = !checked[cursor]
		case n == 1 && buf[0] == ' ': // Space
			checked[cursor] = !checked[cursor]
		case n == 3 && buf[0] == 27 && buf[1] == '[' && buf[2] == 'A': // Up
			if cursor > 0 {
				cursor--
			}
		case n == 3 && buf[0] == 27 && buf[1] == '[' && buf[2] == 'B': // Down
			if cursor < len(agents)-1 {
				cursor++
			}
		case n == 1 && (buf[0] == 3 || buf[0] == 4): // Ctrl+C / Ctrl+D
			fmt.Print("\r\n")
			return nil, fmt.Errorf("已取消")
		}
		render()
	}
}

func agentSkillDir(a Agent, baseDir string) string {
	base := baseDir
	if base == "" {
		base, _ = os.UserHomeDir()
	} else {
		base, _ = filepath.Abs(base)
	}
	return filepath.Join(base, a.SkillDir)
}
