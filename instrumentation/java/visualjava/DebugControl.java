package visualjava;

import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Set;

/** Cooperative control only: never reads Recorder state or application stdin. */
public final class DebugControl {
  private static final Object MONITOR = new Object();
  private static final int COMMAND_LIMIT = 65536;
  private static final Set<String> BREAKPOINTS = new HashSet<>();
  private static BufferedWriter output;
  private static boolean initialized, enabled, configured, paused;
  private static String mode = "entry", failure;
  private static long stepThread;
  private static int stepDepth;
  private DebugControl() {}

  private static String quote(String value) {
    if (value == null) return "null";
    StringBuilder result = new StringBuilder("\"");
    for (int i = 0; i < value.length(); i++) {
      char c = value.charAt(i);
      switch (c) {
        case '"': result.append("\\\""); break;
        case '\\': result.append("\\\\"); break;
        case '\n': result.append("\\n"); break;
        case '\r': result.append("\\r"); break;
        case '\t': result.append("\\t"); break;
        default:
          if (c < 32) result.append(String.format("\\u%04x", (int)c));
          else result.append(c);
      }
    }
    return result.append('"').toString();
  }

  private static void send(String json) throws java.io.IOException {
    output.write(json); output.newLine(); output.flush();
  }

  private static void initialize() {
    if (initialized) return;
    initialized = true;
    String port = System.getProperty("visualjava.debugPort");
    if (port == null) return;
    try {
      String token = System.getProperty("visualjava.debugToken");
      if (token == null || token.isEmpty()) throw new IllegalStateException("Debug control token missing");
      Socket socket = new Socket();
      socket.connect(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), Integer.parseInt(port)), 5000);
      socket.setTcpNoDelay(true);
      output = new BufferedWriter(new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8));
      enabled = true;
      send("{\"v\":1,\"type\":\"hello\",\"token\":" + quote(token) + "}");
      Thread reader = new Thread(() -> readCommands(socket), "VisualJava debug commands");
      reader.setDaemon(true); reader.start();
    } catch (Exception error) {
      failure = "Debug control connection failed";
      enabled = false;
    }
  }

  /** Bound input before allocation, rather than after BufferedReader.readLine(). */
  private static String readCommand(BufferedReader input) throws java.io.IOException {
    StringBuilder line = new StringBuilder();
    for (;;) {
      int value = input.read();
      if (value < 0) return line.length() == 0 ? null : line.toString();
      if (value == '\n') return line.toString();
      if (line.length() >= COMMAND_LIMIT) throw new java.io.IOException("Oversized debug command");
      line.append((char)value);
    }
  }

  private static void readCommands(Socket socket) {
    try (socket; BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8))) {
      String line;
      while ((line = readCommand(input)) != null) {
        String[] parts = line.split("\t", -1);
        String command = parts[0], requestId = parts.length > 1 ? parts[1] : "";
        synchronized (MONITOR) {
          switch (command) {
            case "breakpoints":
              BREAKPOINTS.clear();
              for (int i = 2; i < parts.length; i++) {
                if (!parts[i].matches("[\\p{L}\\p{N}_$.]+:[1-9][0-9]*")) throw new java.io.IOException("Invalid breakpoint");
                BREAKPOINTS.add(parts[i]);
              }
              break;
            case "start": configured = true; break;
            case "pause": mode = "pause"; break;
            case "continue": case "stepInto": case "stepOver": case "stepOut":
              if (!paused) throw new java.io.IOException("Resume/step requires a paused checkpoint");
              mode = command; paused = false; break;
            case "stop": Runtime.getRuntime().halt(87); return;
            default: throw new java.io.IOException("Unknown debug command");
          }
          send("{\"v\":1,\"type\":\"ack\",\"command\":" + quote(command) + ",\"requestId\":" + quote(requestId) + "}");
          MONITOR.notifyAll();
        }
      }
      throw new java.io.IOException("Debug control disconnected");
    } catch (Exception error) {
      synchronized (MONITOR) {
        failure = "Debug control disconnected or command rejected"; enabled = false; paused = false; MONITOR.notifyAll();
      }
    }
  }

  /** Called without the Recorder lock; rawCount freezes when observation stops. */
  public static void checkpoint(String frameId, String owner, String method, int line, int depth, long rawCount) {
    checkpoint(frameId, owner, method, line, depth, rawCount, false);
  }

  /** Exception control checkpoint; observation may already have stopped. */
  public static void exception(String frameId, String owner, String method, int line, int depth, long rawCount) {
    checkpoint(frameId, owner, method, line, depth, rawCount, true);
  }

  /** An inline caller may return without another line checkpoint. Stop in that
   * caller before its exit rather than skipping it. Ordinary next-line stepping
   * and Continue/breakpoints are unchanged. No runtime facts are synthesized. */
  public static void returnBoundary(String frameId, String owner, String method, int line, int depth, long rawCount) {
    synchronized (MONITOR) {
      if (!enabled || paused || !mode.equals("stepOut") || Thread.currentThread().threadId() != stepThread || depth >= stepDepth) return;
      checkpoint(frameId, owner, method, line, depth, rawCount, false);
    }
  }

  private static void checkpoint(String frameId, String owner, String method, int line, int depth, long rawCount, boolean exception) {
    synchronized (MONITOR) {
      initialize();
      if (!enabled) return;
      try {
        while ((!configured || paused) && failure == null) MONITOR.wait();
        if (failure != null) return;
        long thread = Thread.currentThread().threadId();
        String reason = exception ? "exception" : mode.equals("entry") ? "entry"
          : mode.equals("pause") ? "pause" : BREAKPOINTS.contains(owner + ":" + line) ? "breakpoint"
          : thread == stepThread && (mode.equals("stepInto") || mode.equals("stepOver") && depth <= stepDepth
            || mode.equals("stepOut") && depth < stepDepth) ? "step" : null;
        if (reason == null) return;
        paused = true; stepThread = thread; stepDepth = depth;
        send("{\"v\":1,\"type\":\"paused\",\"reason\":" + quote(reason)
          + ",\"threadId\":" + quote(Long.toString(thread)) + ",\"frameId\":" + quote(frameId)
          + ",\"className\":" + quote(owner) + ",\"methodName\":" + quote(method)
          + ",\"line\":" + line + ",\"rawEventCount\":" + rawCount + "}");
        while (paused && failure == null) MONITOR.wait();
        if (failure != null) return;
      } catch (InterruptedException error) {
        Thread.currentThread().interrupt(); paused = false; MONITOR.notifyAll();
      } catch (java.io.IOException error) {
        failure = "Debug checkpoint transport failed"; enabled = false; paused = false; MONITOR.notifyAll();
      }
    }
  }

}
