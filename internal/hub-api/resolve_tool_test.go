package hubapi

import (
	"errors"
	"testing"

	"pt-platform-v2/internal/database"
)

func TestResolveTool(t *testing.T) {
	lookup := func(types map[string]database.FrameworkType) func(string) (database.FrameworkType, error) {
		return func(name string) (database.FrameworkType, error) {
			ft, ok := types[name]
			if !ok {
				return database.FrameworkType{}, errors.New("not found")
			}
			return ft, nil
		}
	}

	cases := []struct {
		name        string
		toolType    string
		types       map[string]database.FrameworkType
		wantTool    string
		wantVersion string
	}{
		{
			name:     "resolved row",
			toolType: "jmeter-5.6",
			types: map[string]database.FrameworkType{
				"jmeter-5.6": {Name: "jmeter-5.6", Tool: "jmeter"},
			},
			wantTool: "jmeter", wantVersion: "jmeter-5.6",
		},
		{
			name:     "row with empty Tool falls back to slug",
			toolType: "Jm-01",
			types: map[string]database.FrameworkType{
				"Jm-01": {Name: "Jm-01", Tool: ""},
			},
			wantTool: "Jm-01", wantVersion: "",
		},
		{
			name:     "lookup error falls back to slug",
			toolType: "ghost-type",
			types:    map[string]database.FrameworkType{},
			wantTool: "ghost-type", wantVersion: "",
		},
		{
			name:     "framework without tool type",
			toolType: "",
			types:    map[string]database.FrameworkType{},
			wantTool: "", wantVersion: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tool, version := resolveTool(tc.toolType, lookup(tc.types))
			if tool != tc.wantTool || version != tc.wantVersion {
				t.Errorf("resolveTool(%q) = (%q, %q), want (%q, %q)",
					tc.toolType, tool, version, tc.wantTool, tc.wantVersion)
			}
		})
	}
}
