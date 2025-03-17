package main

import (
	"bytes"
	"fmt"
	"syscall/js"
	"time"

	"github.com/rs/zerolog"
	"github.com/spf13/viper"
	"github.com/zricethezav/gitleaks/v8/config"
	"github.com/zricethezav/gitleaks/v8/detect"
	"github.com/zricethezav/gitleaks/v8/logging"
	"github.com/zricethezav/gitleaks/v8/report"
)

/*
   Gitleaks WASM Entry Point

   This Go code exposes several functions to JavaScript via the WebAssembly interface:
     - getDefaultConfig: returns the default TOML configuration.
     - getGitleaksVersion: returns the current version string.
     - setUserConfig: accepts user-supplied config, validates it, and updates the detector.
     - scanText: performs the secret scan on input text.
*/

// Global variables to hold our detector and configuration.
var (
	globalDetector *detect.Detector
	globalConfig   = config.DefaultConfig // current TOML config as a string
)

// findingToJSObject converts a Finding into a JavaScript-friendly object.
func findingToJSObject(finding report.Finding) map[string]interface{} {
	tags := make([]interface{}, len(finding.Tags))
	for i, tag := range finding.Tags {
		tags[i] = tag
	}

	return map[string]interface{}{
		"ruleID":      finding.RuleID,
		"match":       finding.Match,
		"startLine":   finding.StartLine + 1, // Convert to 1-indexed for UI
		"endLine":     finding.EndLine,
		"startColumn": finding.StartColumn,
		"endColumn":   finding.EndColumn,
		"secret":      finding.Secret,
		"file":        finding.File,
		"commit":      finding.Commit,
		"author":      finding.Author,
		"description": finding.Description,
		"tags":        tags,
		"entropy":     finding.Entropy,
	}
}

// createJSObject helps transform a Go map into a JavaScript object.
func createJSObject(data map[string]interface{}) js.Value {
	obj := js.Global().Get("Object").New()
	for key, value := range data {
		switch v := value.(type) {
		case []interface{}:
			arr := js.Global().Get("Array").New(len(v))
			for i, item := range v {
				arr.SetIndex(i, js.ValueOf(item))
			}
			obj.Set(key, arr)
		default:
			obj.Set(key, js.ValueOf(v))
		}
	}
	return obj
}

// getDefaultConfig returns the default configuration for display in the UI.
func getDefaultConfig(this js.Value, args []js.Value) interface{} {
	return config.DefaultConfig
}

// getGitleaksVersion exposes the Gitleaks version to the JS environment.
func getGitleaksVersion(this js.Value, args []js.Value) interface{} {
	// Replace with dynamic version if available.
	return "Gitleaks v8.24.0"
}

// setUserConfig validates the provided TOML config and updates the global detector.
func setUserConfig(this js.Value, args []js.Value) (result interface{}) {
	defer func() {
		if r := recover(); r != nil {
			result = fmt.Sprintf("Error: %v", r)
		}
	}()

	if len(args) < 1 {
		return "Error: No config provided"
	}

	userConfig := args[0].String()
	err := updateGlobalDetector(userConfig)
	if err != nil {
		return fmt.Sprintf("Error: %v", err)
	}

	globalConfig = userConfig
	return "OK"
}

// scanText scans the input text for secrets using the global detector.
// It now accepts an optional second argument indicating the desired log level.
func scanText(this js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return "Error: No input text provided"
	}

	inputText := args[0].String()

	// Default log level is Trace
	logLevelStr := "Trace"
	if len(args) >= 2 {
		logLevelStr = args[1].String()
	}

	var level zerolog.Level
	switch logLevelStr {
	case "Trace":
		level = zerolog.TraceLevel
	case "Debug":
		level = zerolog.DebugLevel
	case "Info":
		level = zerolog.InfoLevel
	case "Warn":
		level = zerolog.WarnLevel
	case "Error":
		level = zerolog.ErrorLevel
	default:
		level = zerolog.TraceLevel
	}

	if globalDetector == nil {
		// If the detector hasn't been initialized, try to update it using the current config.
		err := updateGlobalDetector(globalConfig)
		if err != nil {
			return fmt.Sprintf("Error: Detector not initialized - %v", err)
		}
	}

	// Create a buffer to capture logs from the Gitleaks detector.
	var detectorLogBuffer bytes.Buffer
	// Override the logging package's logger to write to our buffer.
	// Disable ANSI colors and set the log level based on the user selection.
	logging.Logger = zerolog.New(zerolog.ConsoleWriter{
		Out:     &detectorLogBuffer,
		NoColor: true,
	}).Level(level)
	// }).Level(level).With().Timestamp().Logger()

	start := time.Now()
	findings := globalDetector.DetectString(inputText)
	duration := time.Since(start)
	logging.Logger.Info().Msgf("Scan completed in %v", duration)
	if len(findings) == 0 {
		logging.Logger.Info().Msg("No secrets found")
	} else {
		logging.Logger.Info().Msgf("Found %d secrets ⬇", len(findings))
	}

	// Capture the logs from the detector.
	logs := detectorLogBuffer.String()

	jsFindings := js.Global().Get("Array").New(len(findings))
	for i, finding := range findings {
		jsObject := createJSObject(findingToJSObject(finding))
		jsFindings.SetIndex(i, jsObject)
	}

	// Return an object containing both the logs and the findings.
	result := js.Global().Get("Object").New()
	result.Set("logs", logs)
	result.Set("findings", jsFindings)
	return result
}

// updateGlobalDetector parses the config string, creates a new detector, and sets it globally.
func updateGlobalDetector(cfgString string) error {
	viper.SetConfigType("toml")
	if err := viper.ReadConfig(bytes.NewBufferString(cfgString)); err != nil {
		return fmt.Errorf("failed to parse config: %w", err)
	}

	var vc config.ViperConfig
	if err := viper.Unmarshal(&vc); err != nil {
		return fmt.Errorf("failed to unmarshal config: %w", err)
	}

	translatedCfg, err := vc.Translate()
	if err != nil {
		return fmt.Errorf("failed to translate config: %w", err)
	}

	// Create a new detector using the supplied configuration.
	detector := detect.NewDetector(translatedCfg)
	globalDetector = detector
	return nil
}

func main() {
	fmt.Println("Go WASM starting")

	// Expose functions to the JS environment.
	js.Global().Set("getDefaultConfig", js.FuncOf(getDefaultConfig))
	js.Global().Set("getGitleaksVersion", js.FuncOf(getGitleaksVersion))
	js.Global().Set("setUserConfig", js.FuncOf(setUserConfig))
	js.Global().Set("scanTextWithGitleaks", js.FuncOf(scanText))

	fmt.Println("Functions registered, entering main loop")
	<-make(chan struct{})
}
