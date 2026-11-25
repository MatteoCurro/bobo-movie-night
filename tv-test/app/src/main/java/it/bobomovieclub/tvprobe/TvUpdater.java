package it.bobomovieclub.tvprobe;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.WebView;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Opt-in APK updates only from this repository's GitHub Release.
 * Android's package installer still requires user confirmation and enforces the signing key.
 */
final class TvUpdater {
    private static final String API =
        "https://api.github.com/repos/MatteoCurro/bobo-movie-night/releases/latest";
    private static final String DOWNLOAD_PREFIX =
        "https://github.com/MatteoCurro/bobo-movie-night/releases/download/";
    private static final String APK_NAME = "Bobo-Movie-Club-TV.apk";
    private static final Pattern TAG = Pattern.compile("^tv-v([0-9]+)\\.([0-9]+)\\.([0-9]+)$");
    private final Activity activity;
    private final WebView web;
    private final ExecutorService worker=Executors.newSingleThreadExecutor();
    private final AtomicBoolean checking=new AtomicBoolean(false);
    private final DownloadManager manager;
    private volatile Release release;
    private long downloadId=-1L;
    private File apk;
    private boolean awaitingPermission=false;
    private boolean registered=false;

    private static final class Release {
        final String version,url,digest;
        Release(String version,String url,String digest) {
            this.version=version;this.url=url;this.digest=digest;
        }
    }
    TvUpdater(Activity activity,WebView web) {
        this.activity=activity;this.web=web;
        manager=(DownloadManager)activity.getSystemService(Context.DOWNLOAD_SERVICE);
        try {
            activity.registerReceiver(receiver,new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
            registered=true;
        } catch(Exception ignored) {}
    }
    private final BroadcastReceiver receiver=new BroadcastReceiver() {
        @Override public void onReceive(Context context,Intent intent) {
            if(!DownloadManager.ACTION_DOWNLOAD_COMPLETE.equals(intent.getAction()))return;
            if(intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID,-1)!=downloadId)return;
            worker.execute(()->verifyDownload());
        }
    };
    private void status(String state,String message,String version,boolean interactive) {
        activity.runOnUiThread(()->{
            try {
                JSONObject data=new JSONObject();
                data.put("state",state);data.put("message",message);
                data.put("version",version);data.put("interactive",interactive);
                web.evaluateJavascript(
                    "window.BoboTVUpdates&&window.BoboTVUpdates.onNativeUpdate("+data.toString()+")",null);
            }catch(Exception ignored) {}
        });
    }
    void check(boolean interactive) {
        if(!checking.compareAndSet(false,true))return;
        worker.execute(()->{
            try {
                HttpURLConnection connection=(HttpURLConnection)new URL(API).openConnection();
                connection.setConnectTimeout(8000);connection.setReadTimeout(8000);
                connection.setRequestProperty("Accept","application/vnd.github+json");
                connection.setRequestProperty("User-Agent","BoboMovieClubTV/1.3");
                int status=connection.getResponseCode();
                if(status==404){
                    this.release=null;
                    status("latest","Nessuna versione TV pubblicata","",interactive);
                    return;
                }
                if(status!=200)throw new IllegalStateException("Catalogo aggiornamenti non raggiungibile");
                ByteArrayOutputStream output=new ByteArrayOutputStream();
                try(InputStream stream=connection.getInputStream()){
                    byte[] buffer=new byte[4096];int read;
                    while((read=stream.read(buffer))!=-1){
                        output.write(buffer,0,read);
                        if(output.size()>524288)throw new IllegalStateException("Risposta troppo grande");
                    }
                } finally {connection.disconnect();}
                JSONObject json=new JSONObject(new String(output.toByteArray(),StandardCharsets.UTF_8));
                String tag=json.optString("tag_name");
                int offered=versionCode(tag);
                if(offered<=BuildConfig.VERSION_CODE){
                    this.release=null;status("latest","Versione aggiornata","",interactive);
                    return;
                }
                JSONArray assets=json.optJSONArray("assets");
                if(assets==null)throw new IllegalStateException("APK non ancora pubblicata");
                Release found=null;
                for(int i=0;i<assets.length();i++){
                    JSONObject a=assets.optJSONObject(i);
                    if(a==null||!APK_NAME.equals(a.optString("name")))continue;
                    String url=a.optString("browser_download_url");
                    if(!url.startsWith(DOWNLOAD_PREFIX) || !url.contains("/"+tag+"/")
                        || !url.endsWith("/"+APK_NAME))continue;
                    String digest=a.optString("digest");
                    if(!digest.matches("sha256:[a-fA-F0-9]{64}"))digest="";
                    found=new Release(tag.substring(4),url,digest);
                    break;
                }
                if(found==null)throw new IllegalStateException("APK TV non disponibile");
                this.release=found;
                status("available","Nuovo aggiornamento",found.version,interactive);
            }catch(Exception error){
                status("error","Verifica aggiornamenti non riuscita","",interactive);
            }finally{checking.set(false);}
        });
    }
    private static int versionCode(String tag){
        Matcher matcher=TAG.matcher(tag);
        if(!matcher.matches())return -1;
        try {
            long major=Long.parseLong(matcher.group(1));
            long minor=Long.parseLong(matcher.group(2));
            long patch=Long.parseLong(matcher.group(3));
            if(major>100||minor>99||patch>99)return -1;
            return (int)(major*10000+minor*100+patch);
        }catch(NumberFormatException ignored){return -1;}
    }
    void installUpdate() {
        Release candidate=release;
        if(candidate==null){check(true);return;}
        activity.runOnUiThread(()->{
            try{
                if(downloadId!=-1)return;
                File root=activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if(root==null || manager==null)throw new IllegalStateException("Memoria TV non disponibile");
                apk=new File(root,APK_NAME);
                if(apk.exists()&&!apk.delete())throw new IllegalStateException("Impossibile sostituire il download");
                DownloadManager.Request req=new DownloadManager.Request(Uri.parse(candidate.url))
                    .setTitle("Bobo Movie Club TV "+candidate.version)
                    .setDescription("Scaricamento aggiornamento")
                    .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                    .setDestinationUri(Uri.fromFile(apk));
                downloadId=manager.enqueue(req);
                status("downloading","Download avviato",candidate.version,true);
            }catch(Exception error){
                downloadId=-1;
                status("error","Scaricamento non riuscito","",true);
            }
        });
    }
    private void verifyDownload() {
        long id=downloadId;
        try {
            DownloadManager.Query query=new DownloadManager.Query().setFilterById(id);
            try(android.database.Cursor cursor=manager.query(query)){
                if(cursor==null || !cursor.moveToFirst())throw new IllegalStateException("Download non trovato");
                int index=cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                if(index<0 || cursor.getInt(index)!=DownloadManager.STATUS_SUCCESSFUL)
                    throw new IllegalStateException("Download non completato");
            }
            Release candidate=release;
            if(apk==null||!apk.isFile()||apk.length()<10000||candidate==null)
                throw new IllegalStateException("APK non valida");
            if(!candidate.digest.isEmpty()) {
                MessageDigest sha=MessageDigest.getInstance("SHA-256");
                try(FileInputStream stream=new FileInputStream(apk)){
                    byte[] buf=new byte[16384];int n;
                    while((n=stream.read(buf))!=-1)sha.update(buf,0,n);
                }
                StringBuilder hex=new StringBuilder();
                for(byte b:sha.digest())hex.append(String.format(Locale.ROOT,"%02x",b&0xff));
                if(!candidate.digest.substring(7).equalsIgnoreCase(hex.toString()))
                    throw new IllegalStateException("Firma del download non valida");
            }
            activity.runOnUiThread(this::showInstaller);
        }catch(Exception error){
            if(apk!=null)apk.delete();
            status("error","Download non verificato. Riprova.","",true);
        }finally{downloadId=-1;}
    }
    private void showInstaller() {
        if(apk==null||!apk.isFile())return;
        if(Build.VERSION.SDK_INT>=Build.VERSION_CODES.O &&
                !activity.getPackageManager().canRequestPackageInstalls()){
            try{
                awaitingPermission=true;
                status("permission","Permesso di installazione richiesto","",true);
                Intent settings=new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:"+activity.getPackageName()));
                activity.startActivity(settings);
            }catch(Exception error){
                awaitingPermission=false;
                status("error","Autorizza l'installazione dalle impostazioni della TV","",true);
            }
            return;
        }
        awaitingPermission=false;
        try {
            Uri uri=FileProvider.getUriForFile(activity,
                activity.getPackageName()+".fileprovider",apk);
            Intent installer=new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri,"application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            activity.startActivity(installer);
            status("install","Conferma aggiornamento","",true);
        }catch(Exception error){
            status("error","Installer non disponibile su questo dispositivo","",true);
        }
    }
    void onResume() {
        if(!awaitingPermission)return;
        if(Build.VERSION.SDK_INT<Build.VERSION_CODES.O ||
           activity.getPackageManager().canRequestPackageInstalls())
            activity.runOnUiThread(this::showInstaller);
    }
    void destroy() {
        if(registered){try{activity.unregisterReceiver(receiver);}catch(Exception ignored){}}
        worker.shutdownNow();
    }
}
