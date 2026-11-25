import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import WorldSelectionImages from './WorldSelectionImages';

const mockSave = jest.fn();
const mockLoad = jest.fn();
jest.mock('../../lib/api', () => ({
  adminAPI: {},
  worldAdminAPI: {
    selectionImages: (...args) => mockLoad(...args),
    setSelectionImages: (...args) => mockSave(...args),
  },
}));
jest.mock('../../hooks/use-toast', () => ({ useToast: () => ({ toast: jest.fn() }) }));
jest.mock('../ui/button', () => ({ Button: ({ children, ...props }) => <button {...props}>{children}</button> }));

global.IS_REACT_ACT_ENVIRONMENT = true;

it('previews and saves independent tablet and desktop spacing', async () => {
  mockLoad.mockResolvedValue({});
  mockSave.mockImplementation(values => Promise.resolve(values));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const change = async (label, value) => {
    const input = container.querySelector(`[aria-label="${label}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const click = async text => {
    const button = [...container.querySelectorAll('button')].find(item => item.textContent.trim() === text);
    await act(async () => button.click());
  };
  try {
    await act(async () => root.render(<WorldSelectionImages />));
    await change('Heading font size', '68');
    expect(container.querySelector('[data-preview-viewport="1440 × 900"]').firstChild.firstChild.style.fontSize).toBe('68px');
    await change('desktop header to title gap', '120');
    await change('desktop title to images gap', '95');
    let preview = container.querySelector('[data-preview-viewport="1440 × 900"]');
    expect(preview.className).toContain('overflow-hidden');
    expect(preview.firstChild.style.overflowY).toBe('auto');
    expect(preview.firstChild.style.transform).toContain('scale(');
    expect(preview.firstChild.style.paddingTop).toBe('120px');
    expect(preview.querySelector('.grid-cols-2').style.marginTop).toBe('95px');

    await change('tablet header to title gap', '80');
    await change('tablet title to images gap', '300');
    await click('Tablet portrait');
    preview = container.querySelector('[data-preview-viewport="820 × 1180"]');
    expect(preview.firstChild.style.paddingTop).toBe('80px');
    expect(preview.querySelector('.grid-cols-1').style.marginTop).toBe('200px');
    expect(preview.querySelector('.grid-cols-1').style.maxWidth).toBe('560px');

    await click('Save images');
    expect(mockSave).toHaveBeenCalledWith(expect.objectContaining({
      header_gap_tablet: 80, header_gap_desktop: 120,
      title_gap_tablet: 200, title_gap_desktop: 95,
      tablet_title_size: 68, desktop_title_size: 68,
    }));
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('waits for saved settings and prevents editing when loading fails', async () => {
  let resolveLoad;
  mockLoad.mockImplementationOnce(() => new Promise(resolve => { resolveLoad = resolve; }));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<WorldSelectionImages />));
    expect(container.textContent).toContain('Loading world selection design');
    expect(container.querySelector('[aria-label="Heading font size"]')).toBeNull();
    await act(async () => resolveLoad({ header_gap_tablet: 80 }));
    expect(container.querySelector('[aria-label="tablet header to title gap"]').value).toBe('80');
    await act(async () => root.unmount());
    mockLoad.mockRejectedValueOnce(new Error('offline'));
    const retryRoot = createRoot(container);
    try {
      await act(async () => retryRoot.render(<WorldSelectionImages />));
      expect(container.textContent).toContain('Could not load the saved design');
      expect(container.querySelector('[aria-label="Heading font size"]')).toBeNull();
    } finally {
      await act(async () => retryRoot.unmount());
    }
  } finally {
    container.remove();
  }
});