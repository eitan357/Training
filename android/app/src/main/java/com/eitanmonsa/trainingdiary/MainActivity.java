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
        getBridge().getWebView().requestFocus();
    }
}
