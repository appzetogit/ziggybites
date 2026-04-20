## Flutter WebView Native Share

Use [`flutter_webview_native_share_example.dart`](./flutter_webview_native_share_example.dart) as the reference integration for the Flutter app.

Required packages:

```yaml
dependencies:
  flutter_inappwebview: ^6.1.5
  image_picker: ^1.1.2
  share_plus: ^10.1.2
```

What this wiring does:

1. Registers a JavaScript handler named `nativeShare`.
2. Receives `{ title, text, url }` from the website.
3. Opens the real Android/iOS native share sheet via `share_plus`.
4. Returns `{ success: true }` back to the website so the web app does not show a clipboard toast.

It also registers `nativeGallery` for onboarding gallery buttons:

1. Receives `{ multiple: true | false }` from the website.
2. Opens the device gallery directly via `image_picker`.
3. Returns selected image files as `{ name, mimeType, base64 }` so the website can upload them normally.

Important WebView settings:

- `javaScriptEnabled: true`
- `javaScriptCanOpenWindowsAutomatically: false`
- `useShouldOverrideUrlLoading: true`
- fire `flutterInAppWebViewPlatformReady` after page load so the website can detect the bridge quickly
