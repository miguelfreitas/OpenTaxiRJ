package org.opentaxirj.client

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.File

class RideLogModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName() = "RideLog"

  private fun logDir(): File {
    val dir = context.getExternalFilesDir("logs") ?: File(context.filesDir, "logs")
    if (!dir.exists()) dir.mkdirs()
    return dir
  }

  private fun logFile() = File(logDir(), "ride-session.log")

  private fun rotate(file: File) {
    if (!file.exists() || file.length() < MAX_BYTES) return
    val previous = File(file.parentFile, "${file.name}.1")
    if (previous.exists()) previous.delete()
    file.renameTo(previous)
  }

  @ReactMethod
  fun append(line: String) {
    try {
      synchronized(this) {
        val file = logFile()
        rotate(file)
        file.appendText(line + "\n", Charsets.UTF_8)
      }
    } catch (error: Throwable) {
      Log.e("RideLog", "append failed", error)
    }
  }

  @ReactMethod
  fun getLogPath(promise: Promise) {
    try {
      promise.resolve(logFile().absolutePath)
    } catch (error: Throwable) {
      promise.reject("ride_log_path_failed", error)
    }
  }

  @ReactMethod
  fun clear(promise: Promise) {
    try {
      synchronized(this) {
        logFile().delete()
        File(logDir(), "ride-session.log.1").delete()
      }
      promise.resolve(null)
    } catch (error: Throwable) {
      promise.reject("ride_log_clear_failed", error)
    }
  }

  companion object {
    private const val MAX_BYTES = 32L * 1024L * 1024L
  }
}
