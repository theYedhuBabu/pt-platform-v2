package tools

import "testing"

func TestIsSupported(t *testing.T) {
	for _, tool := range Supported {
		if !IsSupported(tool) {
			t.Errorf("IsSupported(%q) = false, want true", tool)
		}
	}
	for _, tool := range []string{"", "jmetre", "JMeter", "jmeter-5.6"} {
		if IsSupported(tool) {
			t.Errorf("IsSupported(%q) = true, want false", tool)
		}
	}
}
