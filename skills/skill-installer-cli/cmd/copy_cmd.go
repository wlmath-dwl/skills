package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var (
	copyFrom  string
	copyTo    string
	copySkillNames []string
	copyLocal bool
)

var copyCmd = &cobra.Command{
	Use:   "copy",
	Short: "从一个 Agent 复制 skill 到另一个 Agent",
	Example: `  skill-installer-cli copy --from claude --to kiro --skill ones-task
  skill-installer-cli copy --from kiro --to cursor
  skill-installer-cli copy --from claude --to kiro --local`,
	RunE: runCopy,
}

func init() {
	copyCmd.Flags().StringVar(&copyFrom, "from", "", "源 Agent 名称 (kiro/claude/codex/cursor)")
	copyCmd.Flags().StringVar(&copyTo, "to", "", "目标 Agent 名称 (kiro/claude/codex/cursor)")
	copyCmd.Flags().StringSliceVarP(&copySkillNames, "skill", "s", nil, "指定要复制的 skill（不指定则复制全部）")
	copyCmd.Flags().BoolVarP(&copyLocal, "local", "l", false, "使用当前项目目录（默认用户目录）")
	_ = copyCmd.MarkFlagRequired("from")
	_ = copyCmd.MarkFlagRequired("to")
	rootCmd.AddCommand(copyCmd)
}

func findAgent(name string) *Agent {
	for _, a := range agents {
		if strings.EqualFold(a.Name, name) {
			return &a
		}
	}
	return nil
}

func runCopy(cmd *cobra.Command, args []string) error {
	src := findAgent(copyFrom)
	if src == nil {
		return fmt.Errorf("未知的源 Agent: %s", copyFrom)
	}
	dst := findAgent(copyTo)
	if dst == nil {
		return fmt.Errorf("未知的目标 Agent: %s", copyTo)
	}

	baseDir := ""
	if copyLocal {
		baseDir = "."
	}
	srcDir := agentSkillDir(*src, baseDir)
	dstDir := agentSkillDir(*dst, baseDir)

	// Discover skills in source
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return fmt.Errorf("无法读取 %s 的 skills 目录 (%s): %w", src.Name, srcDir, err)
	}

	var available []string
	for _, e := range entries {
		if e.IsDir() {
			if _, err := os.Stat(filepath.Join(srcDir, e.Name(), "SKILL.md")); err == nil {
				available = append(available, e.Name())
			}
		}
	}
	if len(available) == 0 {
		return fmt.Errorf("%s 中没有已安装的 skill", src.Name)
	}

	// Filter
	var toCopy []string
	if len(copySkillNames) > 0 {
		for _, s := range copySkillNames {
			found := false
			for _, a := range available {
				if strings.EqualFold(a, s) {
					toCopy = append(toCopy, a)
					found = true
					break
				}
			}
			if !found {
				fmt.Fprintf(os.Stderr, "⚠ skill '%s' 在 %s 中未找到\n", s, src.Name)
			}
		}
		if len(toCopy) == 0 {
			return fmt.Errorf("未匹配到任何指定的 skill，可用: %s", strings.Join(available, ", "))
		}
	} else {
		toCopy = available
	}

	for _, name := range toCopy {
		skillSrc := filepath.Join(srcDir, name)
		if err := copySkill(skillSrc, name, dstDir, dst.Name); err != nil {
			fmt.Fprintf(os.Stderr, "✗ 复制 %s 失败: %v\n", name, err)
		}
	}
	fmt.Printf("\n完成：从 %s 复制 %d 个 skill 到 %s\n", src.Name, len(toCopy), dst.Name)
	return nil
}
