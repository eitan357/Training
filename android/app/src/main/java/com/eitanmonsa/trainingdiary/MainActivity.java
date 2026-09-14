package com.eitanmonsa.trainingdiary;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // The very first tap on a text input after a cold app start would only
    // focus the DOM element inside the WebView -- the Android *window*
    // itself hadn't yet been granted input focus by the OS at that point,
    // so the on-screen keyboard never received the request to appear. A
    // second tap worked because the first tap's side effect already
    // granted window focus by then.
    //
    // A 2026-09-09 fix requested focus from onResume(), but onResume()
    // fires when the *Activity* reaches the resumed lifecycle state, which
    // is not the same moment the *window* actually receives OS-level input
    // focus -- that arrives separately, via onWindowFocusChanged(true),
    // typically a frame or more later. Calling requestFocus() from
    // onResume() could run before the window had focus, in which case the
    // call was a silent no-op and the bug still reproduced. This override
    // requests focus from the one lifecycle callback Android actually uses
    // to report "the window now has input focus" -- the reliable fix.
    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().requestFocus();
        }
    }
}
