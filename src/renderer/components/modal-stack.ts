export type ModalFrame<Draft> = Readonly<{
  id: string;
  draft: Draft;
  openerFocusToken: string;
  errors: readonly string[];
}>;

export type ModalTransition<Draft> = Readonly<{
  frames: readonly ModalFrame<Draft>[];
  focusToken?: string;
  selectedId?: string;
}>;

export class ModalStack<Draft> {
  private framesValue: ModalFrame<Draft>[] = [];

  get frames(): readonly ModalFrame<Draft>[] {
    return Object.freeze(this.framesValue.map((frame) => Object.freeze({
      ...frame,
      draft: structuredClone(frame.draft),
      errors: Object.freeze([...frame.errors]),
    })));
  }

  open(id: string, draft: Draft, openerFocusToken: string): ModalTransition<Draft> {
    this.framesValue.push({
      id,
      draft: structuredClone(draft),
      openerFocusToken,
      errors: [],
    });
    return { frames: this.frames };
  }

  update(draft: Draft): ModalTransition<Draft> {
    const current = this.framesValue.at(-1);
    if (current) this.framesValue[this.framesValue.length - 1] = {
      ...current,
      draft: structuredClone(draft),
    };
    return { frames: this.frames };
  }

  invalid(errors: readonly string[]): ModalTransition<Draft> {
    const current = this.framesValue.at(-1);
    if (current) this.framesValue[this.framesValue.length - 1] = {
      ...current,
      errors: [...errors],
    };
    return { frames: this.frames };
  }

  cancel(): ModalTransition<Draft> {
    const closed = this.framesValue.pop();
    return {
      frames: this.frames,
      ...(closed ? { focusToken: closed.openerFocusToken } : {}),
    };
  }

  succeed(selectedId: string): ModalTransition<Draft> {
    const closed = this.framesValue.pop();
    return {
      frames: this.frames,
      selectedId,
      ...(closed ? { focusToken: `${closed.openerFocusToken}:selected:${selectedId}` } : {}),
    };
  }
}
