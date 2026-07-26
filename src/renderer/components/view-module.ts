export type Dispatch<Action> = (action: Action) => void | Promise<void>;

export interface ViewModule<State, Action = never> {
  mount(root: HTMLElement, dispatch: Dispatch<Action>): void;
  render(state: Readonly<State>): void;
  unmount(): void;
}
