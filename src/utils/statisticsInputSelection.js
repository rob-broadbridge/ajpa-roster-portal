// Track only the pointer gesture that enters an unfocused statistics input.
// Later clicks/taps must retain the browser's normal caret positioning.
const enteringInputs = new WeakSet();

const isEditableNumber = (input) => input.tagName === 'INPUT'
  && input.type === 'number' && !input.readOnly && !input.disabled;

export const statisticsInputSelection = {
  onPointerDown(event) {
    const input = event.target;
    enteringInputs.delete(input);
    if (isEditableNumber(input) && event.isPrimary && event.button === 0
      && input.ownerDocument.activeElement !== input) {
      enteringInputs.add(input);
    }
  },
  onFocus(event) {
    if (isEditableNumber(event.target)) event.target.select();
  },
  onClick(event) {
    const input = event.target;
    // The initial pointer gesture can collapse the selection made on focus.
    // Restore it once, after the browser has positioned the caret.
    if (enteringInputs.delete(input) && input.ownerDocument.activeElement === input) {
      input.select();
    }
  },
  onBlur(event) {
    enteringInputs.delete(event.target);
  },
  onPointerCancel(event) {
    enteringInputs.delete(event.target);
  },
  onKeyDown(event) {
    // Do not restore a selection after the user has started keyboard editing.
    enteringInputs.delete(event.target);
  }
};
