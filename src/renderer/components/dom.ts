export const clear = (element: Element): void => {
  element.replaceChildren();
};

export const element = <Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  options: {
    className?: string;
    text?: string;
    attributes?: Readonly<Record<string, string>>;
  } = {},
): HTMLElementTagNameMap[Tag] => {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  for (const [name, value] of Object.entries(options.attributes ?? {})) {
    node.setAttribute(name, value);
  }
  return node;
};

export const button = (
  text: string,
  action: string,
  className = 'button',
): HTMLButtonElement => {
  const node = element('button', { className, text, attributes: { type: 'button' } });
  node.dataset.action = action;
  return node;
};

export const labelledInput = (
  labelText: string,
  name: string,
  value: string,
  type = 'text',
): HTMLLabelElement => {
  const label = element('label', { text: labelText });
  const input = element('input', {
    attributes: { name, type, value, autocomplete: 'off' },
  });
  label.append(input);
  return label;
};
