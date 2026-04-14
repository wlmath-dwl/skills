package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
)

var (
	installRepo   string
	installBranch string
	installLocal  bool
)

var installCmd = &cobra.Command{
	Use:   "install <skill-name>",
	Short: "从默认仓库安装 skill",
	Long: `从 Git 仓库安装 skill 到 Agent skills 目录。

默认仓库: https://git.lianjia.com/gaoran007/skills
默认分支: master`,
	Args: cobra.ExactArgs(1),
	Example: `  skill-installer-cli install ones-task
  skill-installer-cli install ones-task -r https://git.example.com/skills
  skill-installer-cli install ones-task -b develop
  skill-installer-cli install ones-task --local`,
	RunE: runInstall,
}

func init() {
	installCmd.Flags().StringVarP(&installRepo, "repo", "r", "https://git.lianjia.com/gaoran007/skills", "Git 仓库地址")
	installCmd.Flags().StringVarP(&installBranch, "branch", "b", "master", "Git 分支")
	installCmd.Flags().BoolVarP(&installLocal, "local", "l", false, "安装到当前项目目录（默认安装到用户目录）")
	rootCmd.AddCommand(installCmd)
}

func runInstall(cmd *cobra.Command, args []string) error {
	skillName := args[0]

	tmpDir, err := os.MkdirTemp("", "skill-install-*")
	if err != nil {
		return fmt.Errorf("创建临时目录失败: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	repoDir := filepath.Join(tmpDir, "repo")
	fmt.Printf("克隆仓库 %s (分支: %s) ...\n", installRepo, installBranch)
	gitCmd := exec.Command("git", "clone", "--depth=1", "--branch", installBranch, installRepo, repoDir)
	gitCmd.Stderr = os.Stderr
	if err := gitCmd.Run(); err != nil {
		return fmt.Errorf("克隆失败，请检查仓库地址和分支: %s %s", installRepo, installBranch)
	}

	// Validate skill exists
	skillSrc := filepath.Join(repoDir, skillName)
	if _, err := os.Stat(filepath.Join(skillSrc, "SKILL.md")); err != nil {
		return fmt.Errorf("skill '%s' 不存在或缺少 SKILL.md", skillName)
	}

	// Determine targets
	if installLocal {
		baseDir := "."
		selected, err := promptSelectAgents()
		if err != nil {
			return err
		}
		for _, a := range selected {
			target := agentSkillDir(a, baseDir)
			if err := copySkill(skillSrc, skillName, target, a.Name); err != nil {
				fmt.Fprintf(os.Stderr, "✗ %s 安装失败: %v\n", a.Name, err)
			}
		}
		return nil
	}

	selected, err := promptSelectAgents()
	if err != nil {
		return err
	}
	for _, a := range selected {
		target := agentSkillDir(a, "")
		if err := copySkill(skillSrc, skillName, target, a.Name); err != nil {
			fmt.Fprintf(os.Stderr, "✗ %s 安装失败: %v\n", a.Name, err)
		}
	}
	return nil
}
