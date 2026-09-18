import { describe, it, expect } from "vitest";
import { findMatchingCommands, AutocompleteController, AutocompleteTarget } from "../document/autocomplete";

describe("Autocomplete & Incomplete Command Controller Gate", () => {
  it("finds matching commands by prefix case-insensitively", () => {
    const foMatches = findMatchingCommands("\\fo");
    expect(foMatches.length).toBeGreaterThan(0);
    expect(foMatches[0].command).toBe("\\forall");

    const sqMatches = findMatchingCommands("\\sq");
    expect(sqMatches.length).toBeGreaterThan(0);
    expect(sqMatches[0].command).toBe("\\sqrt");

    const empty = findMatchingCommands("plain_text");
    expect(empty).toEqual([]);
  });

  it("leaves incomplete commands literal and accepts completion on Tab or Enter", () => {
    let accepted = "";
    const controller = new AutocompleteController(null as any, (cmd) => {
      accepted = cmd;
    });

    let val = "x = \\fo";
    let caret = val.length;

    const target: AutocompleteTarget = {
      getValue: () => val,
      setValue: (v: string) => { val = v; },
      getSelectionStart: () => caret,
      setSelection: (s: number, _e: number) => { caret = s; },
    };

    // 1. Incomplete command \\fo stays literal
    const matched = controller.checkPrefix(target);
    expect(matched).toBe(true);
    expect(controller.getIsOpen()).toBe(true);
    expect(val).toBe("x = \\fo"); // Untransformed literal text
    expect(controller.getMatches()[0].command).toBe("\\forall");

    // 2. Tab key accepts completion
    const event = { key: "Tab", preventDefault: () => {} } as KeyboardEvent;
    const handled = controller.handleKeydown(event, target);
    expect(handled).toBe(true);
    expect(val).toBe("x = \\forall"); // Completed
    expect(accepted).toBe("\\forall");
    expect(controller.getIsOpen()).toBe(false);

    controller.dispose();
  });

  it("navigates suggestions with ArrowDown and ArrowUp", () => {
    const controller = new AutocompleteController(null as any);

    let val = "\\";
    let caret = 1;

    const target: AutocompleteTarget = {
      getValue: () => val,
      setValue: (v: string) => { val = v; },
      getSelectionStart: () => caret,
      setSelection: (s: number) => { caret = s; },
    };

    controller.checkPrefix(target);
    expect(controller.getSelectedIndex()).toBe(0);

    // ArrowDown advances
    controller.handleKeydown({ key: "ArrowDown", preventDefault: () => {} } as KeyboardEvent, target);
    expect(controller.getSelectedIndex()).toBe(1);

    // ArrowUp retreats
    controller.handleKeydown({ key: "ArrowUp", preventDefault: () => {} } as KeyboardEvent, target);
    expect(controller.getSelectedIndex()).toBe(0);

    controller.dispose();
  });

  it("closes popover on Escape without mutating text", () => {
    const controller = new AutocompleteController(null as any);

    let val = "\\fo";
    let caret = val.length;

    const target: AutocompleteTarget = {
      getValue: () => val,
      setValue: (v: string) => { val = v; },
      getSelectionStart: () => caret,
      setSelection: (s: number) => { caret = s; },
    };

    controller.checkPrefix(target);
    expect(controller.getIsOpen()).toBe(true);

    const escapeEvent = { key: "Escape", preventDefault: () => {} } as KeyboardEvent;
    const handled = controller.handleKeydown(escapeEvent, target);
    expect(handled).toBe(true);
    expect(controller.getIsOpen()).toBe(false);
    expect(val).toBe("\\fo"); // Stays literal

    controller.dispose();
  });
});
