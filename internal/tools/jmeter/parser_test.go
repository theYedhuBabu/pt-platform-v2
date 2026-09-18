package jmeter

import (
	"reflect"
	"testing"
)

func TestParseRequiredCSVsFromBytes(t *testing.T) {
	jmx := []byte(`<?xml version="1.0" encoding="UTF-8"?>
<jmeterTestPlan>
  <CSVDataSet>
    <stringProp name="filename">${__P(userDataFile)}</stringProp>
    <stringProp name="variableNames">user,pass</stringProp>
  </CSVDataSet>
  <CSVDataSet>
    <stringProp name="filename">${__P(productDataFile)}</stringProp>
  </CSVDataSet>
  <CSVDataSet>
    <stringProp name="filename">${__P(userDataFile)}</stringProp>
  </CSVDataSet>
  <HTTPSamplerProxy>
    <stringProp name="filename">not-a-csv-dataset.txt</stringProp>
  </HTTPSamplerProxy>
</jmeterTestPlan>`)

	got := ParseRequiredCSVsFromBytes(jmx)
	want := []string{"productDataFile", "userDataFile"} // sorted, deduplicated
	if !reflect.DeepEqual(got, want) {
		t.Errorf("ParseRequiredCSVsFromBytes() = %v, want %v", got, want)
	}
}

func TestParseRequiredCSVsFromBytesEmpty(t *testing.T) {
	if got := ParseRequiredCSVsFromBytes([]byte(`<jmeterTestPlan></jmeterTestPlan>`)); len(got) != 0 {
		t.Errorf("expected no CSV params, got %v", got)
	}
}
