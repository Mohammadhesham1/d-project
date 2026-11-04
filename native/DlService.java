package com.aldahih.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

/** خدمة أمامية بسيطة علشان التحميل يكمل والتطبيق في الخلفية. */
public class DlService extends Service {
    @Override public IBinder onBind(Intent i) { return null; }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String ch = "aldahih_dl";
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(ch, "التحميلات", NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
        android.app.Notification n = new NotificationCompat.Builder(this, ch)
                .setContentTitle("الدحيح")
                .setContentText("جاري تحميل الحلقات…")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(7, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        else startForeground(7, n);
        return START_NOT_STICKY;
    }
}
