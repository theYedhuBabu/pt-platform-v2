package jmeter

import (
	"os"
	"regexp"
	"sort"
)

var (
	csvDataSetRegex   = regexp.MustCompile(`(?s)<CSVDataSet>.*?</CSVDataSet>`)
	filenamePropRegex = regexp.MustCompile(`<stringProp name="filename">\$\{__P\(([^)]+)\)\}</stringProp>`)
)

// ParseRequiredCSVs reads a JMX file at path and returns the JMeter property names
// used as CSV data source filenames (e.g. ${__P(userDataFile)} → "userDataFile").
func ParseRequiredCSVs(path string) ([]string, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return ParseRequiredCSVsFromBytes(content), nil
}

// ParseRequiredCSVsFromBytes parses JMX content already in memory.
func ParseRequiredCSVsFromBytes(content []byte) []string {
	seen := map[string]bool{}
	for _, block := range csvDataSetRegex.FindAll(content, -1) {
		for _, match := range filenamePropRegex.FindAllSubmatch(block, -1) {
			if len(match) > 1 {
				seen[string(match[1])] = true
			}
		}
	}
	vars := make([]string, 0, len(seen))
	for v := range seen {
		vars = append(vars, v)
	}
	sort.Strings(vars)
	return vars
}
