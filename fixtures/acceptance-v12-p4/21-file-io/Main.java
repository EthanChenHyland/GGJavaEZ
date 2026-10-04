import java.nio.file.*;import java.nio.charset.StandardCharsets;import java.io.*;
public class Main {
 public static void main(String[] args)throws Exception{
 Path report=Path.of("manifest.txt");Files.writeString(report,"dock=7\n",StandardCharsets.UTF_8);String text=Files.readString(report,StandardCharsets.UTF_8);Path buffered=Path.of("buffered.txt");
 try(BufferedWriter writer=Files.newBufferedWriter(buffered,StandardCharsets.UTF_8)){writer.write(text);writer.write("done\n");}
 String line;try(BufferedReader reader=Files.newBufferedReader(buffered,StandardCharsets.UTF_8)){line=reader.readLine();}System.out.println(text.strip()+":"+line);
 }
}
