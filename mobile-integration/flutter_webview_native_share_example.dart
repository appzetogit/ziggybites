import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:image_picker/image_picker.dart';
import 'package:share_plus/share_plus.dart';

class ZiggyWebViewPage extends StatefulWidget {
  const ZiggyWebViewPage({super.key, required this.initialUrl});

  final Uri initialUrl;

  @override
  State<ZiggyWebViewPage> createState() => _ZiggyWebViewPageState();
}

class _ZiggyWebViewPageState extends State<ZiggyWebViewPage> {
  InAppWebViewController? _controller;
  bool _shareInProgress = false;
  bool _galleryInProgress = false;
  final ImagePicker _imagePicker = ImagePicker();

  Future<Map<String, dynamic>> _handleNativeShare(dynamic payload) async {
    if (_shareInProgress) {
      return <String, dynamic>{
        'success': false,
        'error': 'Share already in progress',
      };
    }

    try {
      _shareInProgress = true;

      final data = _normalizeSharePayload(payload);
      final title = data['title']!;
      final text = data['text']!;
      final url = data['url']!;

      final combined = <String>[
        if (title.isNotEmpty) title,
        if (text.isNotEmpty) text,
        if (url.isNotEmpty) url,
      ].join('\n');

      await SharePlus.instance.share(
        ShareParams(
          text: combined,
          subject: title.isNotEmpty ? title : null,
        ),
      );

      return <String, dynamic>{'success': true};
    } catch (error) {
      return <String, dynamic>{
        'success': false,
        'error': error.toString(),
      };
    } finally {
      _shareInProgress = false;
    }
  }

  Map<String, String> _normalizeSharePayload(dynamic payload) {
    dynamic raw = payload;

    if (payload is List && payload.isNotEmpty) {
      raw = payload.first;
    }

    if (raw is String && raw.isNotEmpty) {
      raw = jsonDecode(raw) as Map<String, dynamic>;
    }

    if (raw is! Map) {
      return const <String, String>{
        'title': '',
        'text': '',
        'url': '',
      };
    }

    return <String, String>{
      'title': '${raw['title'] ?? ''}'.trim(),
      'text': '${raw['text'] ?? ''}'.trim(),
      'url': '${raw['url'] ?? ''}'.trim(),
    };
  }

  Future<Map<String, dynamic>> _handleNativeGallery(dynamic payload) async {
    if (_galleryInProgress) {
      return <String, dynamic>{
        'success': false,
        'error': 'Gallery already in progress',
      };
    }

    try {
      _galleryInProgress = true;
      final data = _normalizeGalleryPayload(payload);
      final multiple = data['multiple'] == true;

      final List<XFile> pickedFiles;
      if (multiple) {
        pickedFiles = await _imagePicker.pickMultiImage(imageQuality: 90);
      } else {
        final pickedFile = await _imagePicker.pickImage(
          source: ImageSource.gallery,
          imageQuality: 90,
        );
        pickedFiles = pickedFile == null ? <XFile>[] : <XFile>[pickedFile];
      }

      if (pickedFiles.isEmpty) {
        return <String, dynamic>{'success': false, 'cancelled': true};
      }

      final files = <Map<String, dynamic>>[];
      for (final file in pickedFiles) {
        final bytes = await file.readAsBytes();
        files.add(<String, dynamic>{
          'name': file.name,
          'mimeType': file.mimeType ?? _mimeTypeForPath(file.path),
          'base64': base64Encode(bytes),
        });
      }

      return <String, dynamic>{
        'success': true,
        'files': files,
      };
    } catch (error) {
      return <String, dynamic>{
        'success': false,
        'error': error.toString(),
      };
    } finally {
      _galleryInProgress = false;
    }
  }

  Map<String, dynamic> _normalizeGalleryPayload(dynamic payload) {
    dynamic raw = payload;

    if (payload is List && payload.isNotEmpty) {
      raw = payload.first;
    }

    if (raw is String && raw.isNotEmpty) {
      raw = jsonDecode(raw) as Map<String, dynamic>;
    }

    if (raw is Map) {
      return <String, dynamic>{
        'multiple': raw['multiple'] == true,
      };
    }

    return const <String, dynamic>{'multiple': false};
  }

  String _mimeTypeForPath(String path) {
    final lowerPath = path.toLowerCase();
    if (lowerPath.endsWith('.png')) return 'image/png';
    if (lowerPath.endsWith('.webp')) return 'image/webp';
    if (lowerPath.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: InAppWebView(
          initialUrlRequest: URLRequest(url: WebUri(widget.initialUrl.toString())),
          initialSettings: InAppWebViewSettings(
            javaScriptEnabled: true,
            javaScriptCanOpenWindowsAutomatically: false,
            mediaPlaybackRequiresUserGesture: false,
            allowsInlineMediaPlayback: true,
            useShouldOverrideUrlLoading: true,
          ),
          onWebViewCreated: (controller) {
            _controller = controller;

            controller.addJavaScriptHandler(
              handlerName: 'nativeShare',
              callback: (arguments) async {
                return _handleNativeShare(arguments);
              },
            );

            controller.addJavaScriptHandler(
              handlerName: 'nativeGallery',
              callback: (arguments) async {
                return _handleNativeGallery(arguments);
              },
            );
          },
          onLoadStop: (controller, url) async {
            await controller.evaluateJavascript(
              source: '''
                window.__flutter_inappwebview_ready__ = true;
                window.dispatchEvent(new Event('flutterInAppWebViewPlatformReady'));
              ''',
            );
          },
        ),
      ),
    );
  }
}
