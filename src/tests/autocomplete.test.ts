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

  it("includes all first-class data structures and ranks them by cosine similarity", () => {
    // 1. Check that all essential data structures are registered
    const allRoot = findMatchingCommands("\\");
    const dataStructures = allRoot.filter(item => item.category === "data_structure");
    const dsCommands = dataStructures.map(ds => ds.command);

    expect(dsCommands).toContain("\\cases");
    expect(dsCommands).toContain("\\table");
    expect(dsCommands).toContain("\\matrix");
    expect(dsCommands).toContain("\\list");
    expect(dsCommands).toContain("\\tuple");
    expect(dsCommands).toContain("\\record");
    expect(dsCommands).toContain("\\struct");
    expect(dsCommands).toContain("\\set");
    expect(dsCommands).toContain("\\multiset");
    expect(dsCommands).toContain("\\dict");
    expect(dsCommands).toContain("\\vector");
    expect(dsCommands).toContain("\\tensor");
    expect(dsCommands).toContain("\\series");
    expect(dsCommands).toContain("\\tree");
    expect(dsCommands).toContain("\\trajectory");
    expect(dsCommands).toContain("\\space");
    expect(dsCommands).toContain("\\figure");
    expect(dsCommands).toContain("\\derive");

    // 2. Querying \foo returns prefix matches then data structures sorted by cosine similarity
    const foMatches = findMatchingCommands("\\fo");
    expect(foMatches[0].command).toBe("\\forall");
    expect(foMatches[1].command).toBe("\\form");

    // Every single data structure is present in foMatches so user can navigate all of them!
    for (const dsCmd of dsCommands) {
      expect(foMatches.some(m => m.command === dsCmd)).toBe(true);
    }

    // 3. Querying \cas ranks \cases at top
    const casMatches = findMatchingCommands("\\cas");
    expect(casMatches[0].command).toBe("\\cases");

    // 4. Querying \tab ranks \table at top
    const tabMatches = findMatchingCommands("\\tab");
    expect(tabMatches[0].command).toBe("\\table");

    // 5. Querying \mat ranks \match and \matrix at top
    const matMatches = findMatchingCommands("\\mat");
    expect(matMatches.map(m => m.command)).toContain("\\matrix");
    expect(matMatches[0].command.startsWith("\\mat")).toBe(true);
  });

  it("allows navigating through all data structures and wraps around", () => {
    const controller = new AutocompleteController(null as any);

    let val = "\\fo";
    let caret = 3;

    const target: AutocompleteTarget = {
      getValue: () => val,
      setValue: (v: string) => { val = v; },
      getSelectionStart: () => caret,
      setSelection: (s: number) => { caret = s; },
    };

    controller.checkPrefix(target);
    const totalMatches = controller.getMatches().length;
    expect(totalMatches).toBeGreaterThan(20);

    // Navigate down 10 times to verify scrolling past the initial 8 items
    for (let step = 0; step < 10; step++) {
      controller.handleKeydown({ key: "ArrowDown", preventDefault: () => {} } as KeyboardEvent, target);
    }
    expect(controller.getSelectedIndex()).toBe(10);

    // Navigate all the way to end
    for (let step = 10; step < totalMatches - 1; step++) {
      controller.handleKeydown({ key: "ArrowDown", preventDefault: () => {} } as KeyboardEvent, target);
    }
    expect(controller.getSelectedIndex()).toBe(totalMatches - 1);

    // One more ArrowDown wraps back to 0
    controller.handleKeydown({ key: "ArrowDown", preventDefault: () => {} } as KeyboardEvent, target);
    expect(controller.getSelectedIndex()).toBe(0);

    controller.dispose();
  });
});
