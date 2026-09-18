package hubapi

import (
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func TestListFrameworkFiles(t *testing.T) {
	scriptsDir := t.TempDir()
	base := filepath.Join(scriptsDir, "frameworks", "fw-1")
	for _, rel := range []string{
		"config/dev.properties",
		"src/data/test.csv",
		"src/scripts/templateScript.jmx",
		"temp/jmeter.log",
		"util/traceIdGenerator.groovy",
	} {
		p := filepath.Join(base, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte("x"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	files, err := listFrameworkFiles(scriptsDir, "fw-1")
	if err != nil {
		t.Fatalf("listFrameworkFiles: %v", err)
	}
	sort.Strings(files)
	want := []string{
		"config/dev.properties",
		"src/data/test.csv",
		"src/scripts/templateScript.jmx",
		"temp/jmeter.log",
		"util/traceIdGenerator.groovy",
	}
	if !reflect.DeepEqual(files, want) {
		t.Errorf("listFrameworkFiles = %v, want %v", files, want)
	}
}

func TestListFrameworkFilesMissingDir(t *testing.T) {
	files, err := listFrameworkFiles(t.TempDir(), "no-such-framework")
	if err != nil {
		t.Fatalf("missing dir must not error, got %v", err)
	}
	if len(files) != 0 {
		t.Errorf("expected empty list, got %v", files)
	}
}

func TestPartitionRunFiles(t *testing.T) {
	pkg := []string{
		"config/dev.properties",
		"src/data/test.csv",
		"src/scripts/templateScript.jmx",
	}

	// Distributed run with a split selection: the selected CSV moves to the
	// split set, the rest of the package ships shared and untouched.
	shared, split := partitionRunFiles(pkg, []string{"src/data/test.csv"})
	if want := []string{"config/dev.properties", "src/scripts/templateScript.jmx"}; !reflect.DeepEqual(shared, want) {
		t.Errorf("shared = %v, want %v", shared, want)
	}
	if want := []string{"src/data/test.csv"}; !reflect.DeepEqual(split, want) {
		t.Errorf("split = %v, want %v", split, want)
	}

	// Single mode clears the selection: the whole package is shared.
	shared, split = partitionRunFiles(pkg, nil)
	if !reflect.DeepEqual(shared, pkg) {
		t.Errorf("shared = %v, want full package %v", shared, pkg)
	}
	if split != nil {
		t.Errorf("split = %v, want nil", split)
	}

	// Selected files absent from the package are ignored.
	shared, split = partitionRunFiles(pkg, []string{"src/data/missing.csv"})
	if !reflect.DeepEqual(shared, pkg) || split != nil {
		t.Errorf("missing selection must be ignored, got shared=%v split=%v", shared, split)
	}
}
