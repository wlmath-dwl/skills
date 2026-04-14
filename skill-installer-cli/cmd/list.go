package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

var listDir string

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "列出各 Agent 已安装的 skills",
	RunE: func(cmd *cobra.Command, args []string) error {
		if listDir != "" {
			target, _ := filepath.Abs(listDir)
			// Scan agent skill dirs within the project
			for _, a := range agents {
				dir := filepath.Join(target, a.SkillDir)
				if _, err := os.Stat(dir); err != nil {
					continue
				}
				fmt.Printf("[%s] %s\n", a.Name, dir)
				listSkillsInDir(dir, "  ")
				fmt.Println()
			}
			// Also list top-level skills
			fmt.Printf("[project] %s\n", target)
			listSkillsInDir(target, "  ")
			fmt.Println()
			return nil
		}

		for _, a := range agents {
			dir := agentSkillDir(a, "")
			fmt.Printf("[%s] %s\n", a.Name, dir)
			if err := listSkillsInDir(dir, "  "); err != nil {
				fmt.Printf("  (无法读取)\n")
			}
			fmt.Println()
		}
		return nil
	},
}

func listSkillsInDir(dir, indent string) error {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	count := 0
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		if _, err := os.Stat(filepath.Join(dir, e.Name(), "SKILL.md")); err == nil {
			fmt.Printf("%s• %s\n", indent, e.Name())
			count++
		}
	}
	if count == 0 {
		fmt.Printf("%s暂无已安装的 skill\n", indent)
	} else {
		fmt.Printf("%s共 %d 个 skill\n", indent, count)
	}
	return nil
}

func init() {
	listCmd.Flags().StringVarP(&listDir, "dir", "d", "", "指定目录 (不指定则列出所有 Agent)")
	rootCmd.AddCommand(listCmd)
}
