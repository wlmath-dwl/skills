package cmd

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/spf13/cobra"
)

var (
	addSkills []string
	addLocal  bool
)

// skillSearchDirs are the directories where skills are discovered in a repo.
var skillSearchDirs = []string{
	".", "skill", "skills", ".agents/skills", ".claude/skills", ".kiro/skills",
	".codex/skills", ".cursor/skills",
}

var addCmd = &cobra.Command{
	Use:   "add <source>",
	Short: "从 GitHub 仓库安装 skill（兼容 skills.sh 生态）",
	Long: `从 GitHub 仓库安装 skill，兼容 skills.sh / Agent Skills 生态。

支持的 source 格式：
  owner/repo                          GitHub shorthand
  https://github.com/owner/repo       完整 GitHub URL
  git@github.com:owner/repo.git       SSH URL`,
	Args: cobra.ExactArgs(1),
	Example: `  skill-installer-cli add anthropics/skills --skill find-skills
  skill-installer-cli add https://github.com/vercel-labs/agent-skills --skill web-design-guidelines
  skill-installer-cli add vercel-labs/agent-skills  # 交互选择 skill
  skill-installer-cli add anthropics/skills --skill find-skills --local  # 安装到当前项目`,
	RunE: runAdd,
}

func init() {
	addCmd.Flags().StringSliceVarP(&addSkills, "skill", "s", nil, "指定要安装的 skill 名称（可多次使用）")
	addCmd.Flags().BoolVarP(&addLocal, "local", "l", false, "安装到当前项目目录（默认安装到用户目录）")
	rootCmd.AddCommand(addCmd)
}

// resolveGitURL converts owner/repo shorthand or GitHub URLs to a clone-able git URL.
func resolveGitURL(source string) string {
	// Already a full URL or SSH
	if strings.HasPrefix(source, "https://") || strings.HasPrefix(source, "http://") ||
		strings.HasPrefix(source, "git@") || strings.HasPrefix(source, "git://") {
		s := source
		// Strip /tree/branch/... suffix from GitHub URLs
		if re := regexp.MustCompile(`(https?://github\.com/[^/]+/[^/]+)(/tree/.+)?$`); re.MatchString(s) {
			s = re.FindStringSubmatch(s)[1]
		}
		return s
	}
	// owner/repo shorthand
	if matched, _ := regexp.MatchString(`^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$`, source); matched {
		return "https://github.com/" + source
	}
	return source
}

// discoverSkills finds all valid skill directories in a cloned repo.
func discoverSkills(repoDir string) []string {
	seen := map[string]bool{}
	var skills []string

	for _, base := range skillSearchDirs {
		dir := filepath.Join(repoDir, base)
		entries, err := os.ReadDir(dir)
		if err != nil {
			// base itself might be a skill
			if base == "." {
				if _, err := os.Stat(filepath.Join(dir, "SKILL.md")); err == nil {
					name := filepath.Base(repoDir)
					if !seen[name] {
						seen[name] = true
						skills = append(skills, name)
					}
				}
			}
			continue
		}
		for _, e := range entries {
			if !e.IsDir() {
				continue
			}
			if _, err := os.Stat(filepath.Join(dir, e.Name(), "SKILL.md")); err == nil {
				if !seen[e.Name()] {
					seen[e.Name()] = true
					skills = append(skills, e.Name())
				}
			}
		}
	}
	return skills
}

// findSkillPath returns the absolute path of a skill directory in the repo.
func findSkillPath(repoDir, name string) string {
	for _, base := range skillSearchDirs {
		p := filepath.Join(repoDir, base, name)
		if _, err := os.Stat(filepath.Join(p, "SKILL.md")); err == nil {
			return p
		}
	}
	return ""
}

func runAdd(cmd *cobra.Command, args []string) error {
	source := args[0]
	gitURL := resolveGitURL(source)

	tmpDir, err := os.MkdirTemp("", "skill-add-*")
	if err != nil {
		return fmt.Errorf("创建临时目录失败: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	repoDir := filepath.Join(tmpDir, "repo")
	fmt.Printf("克隆仓库 %s ...\n", gitURL)
	gitCmd := exec.Command("git", "clone", "--depth=1", gitURL, repoDir)
	gitCmd.Stderr = os.Stderr
	if err := gitCmd.Run(); err != nil {
		return fmt.Errorf("克隆失败，请检查 URL: %s", gitURL)
	}

	available := discoverSkills(repoDir)
	if len(available) == 0 {
		return fmt.Errorf("仓库中未发现任何 skill（需包含 SKILL.md）")
	}

	// Determine which skills to install
	var toInstall []string
	if len(addSkills) > 0 {
		for _, s := range addSkills {
			found := false
			for _, a := range available {
				if strings.EqualFold(a, s) {
					toInstall = append(toInstall, a)
					found = true
					break
				}
			}
			if !found {
				fmt.Fprintf(os.Stderr, "⚠ skill '%s' 未找到，可用: %s\n", s, strings.Join(available, ", "))
			}
		}
		if len(toInstall) == 0 {
			return fmt.Errorf("未匹配到任何指定的 skill")
		}
	} else {
		// Interactive: list and let user pick
		fmt.Printf("\n发现 %d 个 skill:\n", len(available))
		for i, s := range available {
			fmt.Printf("  %d) %s\n", i+1, s)
		}
		fmt.Println("\n将安装全部 skill，或使用 --skill 指定")
		toInstall = available
	}

	// Select agents
	selected, err := promptSelectAgents()
	if err != nil {
		return err
	}

	// Install each skill to each agent
	for _, skillName := range toInstall {
		skillSrc := findSkillPath(repoDir, skillName)
		if skillSrc == "" {
			fmt.Fprintf(os.Stderr, "✗ 找不到 skill '%s'\n", skillName)
			continue
		}
		baseDir := ""
		if addLocal {
			baseDir = "."
		}
		for _, a := range selected {
			target := agentSkillDir(a, baseDir)
			if err := copySkill(skillSrc, skillName, target, a.Name); err != nil {
				fmt.Fprintf(os.Stderr, "✗ %s 安装失败: %v\n", a.Name, err)
			}
		}
	}
	return nil
}
