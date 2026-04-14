package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"

	"github.com/spf13/cobra"
)

const defaultRepoURL = "https://git.lianjia.com/gaoran007/skills"

var (
	branch    string
	targetDir string
	repoURL   string
)

var installCmd = &cobra.Command{
	Use:   "install <skill-name>",
	Short: "从 Git 仓库安装 skill 到指定 Agent",
	Args:  cobra.ExactArgs(1),
	Example: `  # 使用默认仓库
  skill-installer-cli install ones-task
  # 自定义仓库
  skill-installer-cli install ones-task -r https://git.example.com/skills
  # 指定分支
  skill-installer-cli install ones-task -b develop`,
	RunE: func(cmd *cobra.Command, args []string) error {
		skillName := args[0]

		selected, err := promptSelectAgents()
		if err != nil {
			return err
		}

		tmpDir, err := os.MkdirTemp("", "skill-install-*")
		if err != nil {
			return fmt.Errorf("创建临时目录失败: %w", err)
		}
		defer os.RemoveAll(tmpDir)

		repoDir := filepath.Join(tmpDir, "repo")
		fmt.Printf("克隆仓库 %s (分支: %s)...\n", repoURL, branch)
		gitCmd := exec.Command("git", "clone", "-b", branch, repoURL, repoDir)
		gitCmd.Stderr = os.Stderr
		if err := gitCmd.Run(); err != nil {
			return fmt.Errorf("克隆失败，请检查 URL 和分支")
		}

		skillSrc := filepath.Join(repoDir, skillName)
		if _, err := os.Stat(skillSrc); os.IsNotExist(err) {
			return fmt.Errorf("仓库中不存在 skill 目录 '%s'", skillName)
		}
		if _, err := os.Stat(filepath.Join(skillSrc, "SKILL.md")); os.IsNotExist(err) {
			return fmt.Errorf("缺少 SKILL.md 文件，不是有效的 skill 目录")
		}

		for _, a := range selected {
			target := agentSkillDir(a, targetDir)
			if err := copySkill(skillSrc, skillName, target, a.Name); err != nil {
				fmt.Fprintf(os.Stderr, "✗ %s 安装失败: %v\n", a.Name, err)
			}
		}
		return nil
	},
}

func copySkill(skillSrc, skillName, target, agentName string) error {
	skillDst := filepath.Join(target, skillName)
	if _, err := os.Stat(skillDst); err == nil {
		os.RemoveAll(skillDst)
	}
	os.MkdirAll(target, 0755)

	cpCmd := exec.Command("cp", "-r", skillSrc, skillDst)
	if err := cpCmd.Run(); err != nil {
		return fmt.Errorf("复制失败: %w", err)
	}
	fmt.Printf("✓ [%s] Skill '%s' 安装到 %s\n", agentName, skillName, skillDst)
	return nil
}

func init() {
	installCmd.Flags().StringVarP(&repoURL, "repo", "r", defaultRepoURL, "Git 仓库地址")
	installCmd.Flags().StringVarP(&branch, "branch", "b", "master", "Git 分支")
	installCmd.Flags().StringVarP(&targetDir, "target", "t", "", "基础路径 (替代 home 目录)")
	rootCmd.AddCommand(installCmd)
}
