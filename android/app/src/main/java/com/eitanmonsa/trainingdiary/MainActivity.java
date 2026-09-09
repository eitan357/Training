package com.eitanmonsa.trainingdiary;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Without this, the very first tap on a text input after a cold app
    // start only focuses the DOM element inside the WebView -- the Android
    // *window* itself hasn't yet been granted input focus by the OS at that
    // point, so the on-screen keyboard never receives the request to
    // appear. A second tap works because the first tap's side effect
    // already granted window focus by then. Requesting focus on the
    // WebView explicitly once the Activity resumes closes that gap for
    // every text input in the app, not just whichever screen loads first.
    @Override
    public void onResume() {
        super.onResume();
        // BridgeActivity's own onCreate() returns early -- leaving
        // getBridge() null -- if the WebView layout fails to inflate (e.g.
        // Android System WebView missing/disabled/mid-update), showing a
        // fallback "no webview" screen instead. Every other lifecycle
        // override in BridgeActivity null-guards getBridge() for exactly
        // this reason; skipping the guard here would turn that graceful
        // fallback into a hard NPE crash on resume for those devices.
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().requestFocus();
        }
    }
}
