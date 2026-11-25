import { act } from 'react';
import { createRoot } from 'react-dom/client';
import ProfilePictureCrop from './ProfilePictureCrop';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  URL.createObjectURL = jest.fn(() => 'blob:preview');
  URL.revokeObjectURL = jest.fn();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

test('previews without uploading until the player confirms', async () => {
  const confirm = jest.fn();
  const file = new File(['image'], 'photo.png', { type: 'image/png' });
  const drawImage = jest.fn();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage });
  jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => callback(new Blob(['cropped'], { type: 'image/png' })));
  await act(async () => root.render(<ProfilePictureCrop file={file} onCancel={jest.fn()} onConfirm={confirm} />));
  const image = document.querySelector('img[alt="Profile picture preview"]');
  Object.defineProperties(image, { naturalWidth: { value: 1200 }, naturalHeight: { value: 800 } });
  await act(async () => image.dispatchEvent(new Event('load', { bubbles: true })));
  expect(confirm).not.toHaveBeenCalled();
  await act(async () => document.querySelector('[data-testid="profile-picture-confirm"]').click());
  expect(drawImage).toHaveBeenCalledWith(image, 200, 0, 800, 800, 0, 0, 1024, 1024);
  expect(confirm).toHaveBeenCalledWith(expect.any(File));
});