## Flutter WebView Native Share

Use [`flutter_webview_native_share_example.dart`](./flutter_webview_native_share_example.dart) as the reference integration for the Flutter app.

Required packages:

```yaml
dependencies:
  flutter_inappwebview: ^6.1.5
  share_plus: ^10.1.2
```

What this wiring does:

1. Registers a JavaScript handler named `nativeShare`.
2. Receives `{ title, text, url }` from the website.
3. Opens the real Android/iOS native share sheet via `share_plus`.
4. Returns `{ success: true }` back to the website so the web app does not show a clipboard toast.

Important WebView settings:

- `javaScriptEnabled: true`
- `javaScriptCanOpenWindowsAutomatically: false`
- `useShouldOverrideUrlLoading: true`
- fire `flutterInAppWebViewPlatformReady` after page load so the website can detect the bridge quickly
