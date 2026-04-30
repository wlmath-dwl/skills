package cmd

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// copySkill copies a skill directory to the target skills directory.
func copySkill(srcDir, skillName, targetDir, agentName string) error {
	dst := filepath.Join(targetDir, skillName)
	if err := os.MkdirAll(dst, 0o755); err != nil {
		return err
	}
	if err := copyDir(srcDir, dst); err != nil {
		return err
	}
	fmt.Printf("✓ [%s] %s → %s\n", agentName, skillName, dst)
	return nil
}

func copyDir(src, dst string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}
	for _, e := range entries {
		s := filepath.Join(src, e.Name())
		d := filepath.Join(dst, e.Name())
		if e.IsDir() {
			if err := os.MkdirAll(d, 0o755); err != nil {
				return err
			}
			if err := copyDir(s, d); err != nil {
				return err
			}
		} else {
			if err := copyFile(s, d); err != nil {
				return err
			}
		}
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, in)
	return err
}
