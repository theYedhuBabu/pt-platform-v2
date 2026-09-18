package hubapi

import (
	"testing"

	"pt-platform-v2/internal/database"
)

// jm01Structure mirrors the live "Jm-01" FrameworkType layout.
func jm01Structure(dataSplit bool) map[string]database.StructNode {
	return map[string]database.StructNode{
		"config": {Required: true, Role: "config", Children: map[string]database.StructNode{
			"*.properties": {Ext: ".properties", Required: true},
		}},
		"src": {Required: true, Children: map[string]database.StructNode{
			"data": {Split: dataSplit, Children: map[string]database.StructNode{
				"*.csv": {Ext: ".csv"},
			}},
			"scripts": {Entrypoint: true, Required: true, Children: map[string]database.StructNode{
				"*.jmx": {Ext: ".jmx", Required: true},
			}},
		}},
		"util": {Role: "util", Children: map[string]database.StructNode{
			"*.groovy": {Ext: ".groovy"},
		}},
		"plugins": {Role: "plugin", Children: map[string]database.StructNode{
			"*.jar": {Ext: ".jar"},
		}},
	}
}

func TestClassifyFileWithSplit(t *testing.T) {
	structure := jm01Structure(true)
	cases := []struct {
		path string
		want fileRole
	}{
		{"src/scripts/checkout.jmx", fileRoleEntrypoint},
		{"src/data/users.csv", fileRoleData},
		{"src/data/nested/more.csv", fileRoleData},
		{"config/jmeter.properties", fileRoleConfig},
		{"util/helper.groovy", fileRoleUtil},
		{"util/nested/deep.groovy", fileRoleUtil}, // role inherits down the tree
		{"plugins/custom.jar", fileRolePlugin},
		{"unknown/file.txt", fileRoleNone}, // untagged paths are excluded, not configs
	}
	for _, tc := range cases {
		if got := classifyFile(tc.path, structure); got != tc.want {
			t.Errorf("classifyFile(%q) = %v, want %v", tc.path, got, tc.want)
		}
	}
}

func TestClassifyFileWithoutSplit(t *testing.T) {
	// Without split: true on the data node (and no role tag on the path),
	// CSVs carry no role and are excluded from listings.
	structure := jm01Structure(false)
	if got := classifyFile("src/data/users.csv", structure); got != fileRoleNone {
		t.Errorf("classifyFile(data csv, no split) = %v, want fileRoleNone", got)
	}
	if got := classifyFile("src/scripts/checkout.jmx", structure); got != fileRoleEntrypoint {
		t.Errorf("entrypoint classification must not depend on split, got %v", got)
	}
}

func TestClassifyFileWithWildcards(t *testing.T) {
	structure := map[string]database.StructNode{
		"config": {
			Required: true,
			Children: map[string]database.StructNode{
				"*.properties": {Ext: ".properties", Role: "plugin"},
			},
		},
	}

	if got := classifyFile("config/dev.properties", structure); got != fileRolePlugin {
		t.Errorf("classifyFile(config/dev.properties) = %v, want fileRolePlugin", got)
	}
}
