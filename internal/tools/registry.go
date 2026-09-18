// Package tools defines the canonical registry of test-tool runtimes the
// platform's agents can execute. FrameworkTypes must reference one of these;
// the value is shipped to agents as CommandMessage.framework_type.
package tools

import "strings"

// Supported is the single source of truth for valid FrameworkType tools.
// Adding a runtime here is all the hub needs; agents declare what they
// actually run.
var Supported = []string{"jmeter", "k6", "gatling"}

func IsSupported(tool string) bool {
	for _, t := range Supported {
		if t == tool {
			return true
		}
	}
	return false
}

// SupportedList renders the registry for error messages: "jmeter, k6, gatling".
func SupportedList() string {
	return strings.Join(Supported, ", ")
}
