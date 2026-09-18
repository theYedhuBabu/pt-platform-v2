package hubapi

import (
	"encoding/json"
	"testing"

	"pt-platform-v2/internal/database"
)

func TestClassifyFile(t *testing.T) {
	structureJSON := `{
	  "config": {
	    "required": true,
	    "role": "config",
	    "children": {
	      "*.properties": {"ext": ".properties", "required": true}
	    }
	  },
	  "src": {
	    "required": true,
	    "children": {
	      "data": {
	        "split": true,
	        "children": {"*.csv": {"ext": ".csv"}}
	      },
	      "scripts": {
	        "required": true,
	        "entrypoint": true,
	        "children": {"*.jmx": {"ext": ".jmx", "required": true}}
	      }
	    }
	  },
	  "temp": {"required": false},
	  "util": {
	    "role": "util",
	    "children": {"*.groovy": {"ext": ".groovy"}}
	  }
	}`

	var structure map[string]database.StructNode
	if err := json.Unmarshal([]byte(structureJSON), &structure); err != nil {
		t.Fatalf("unmarshal structure: %v", err)
	}

	cases := []struct {
		relPath string
		want    fileRole
	}{
		{"config/dev.properties", fileRoleConfig},
		{"src/data/test.csv", fileRoleData},
		{"src/scripts/templateScript.jmx", fileRoleEntrypoint},
		{"util/traceIdGenerator.groovy", fileRoleUtil},
		{"temp/jmeter.log", fileRoleNone},  // node exists but carries no role tag
		{"unknown/file.txt", fileRoleNone}, // not in the structure at all
	}

	for _, tc := range cases {
		if got := classifyFile(tc.relPath, structure); got != tc.want {
			t.Errorf("classifyFile(%q) = %v, want %v", tc.relPath, got, tc.want)
		}
	}
}
