import javax.tools.*;import java.nio.file.*;import java.net.*;
public class Main {
 static class IsolatedLoader extends URLClassLoader {IsolatedLoader(URL url){super(new URL[]{url},Main.class.getClassLoader());}}
 public static void main(String[] args)throws Exception{
  Path dir=Path.of("generated");Files.createDirectories(dir);Path source=dir.resolve("RuntimePlugin.java");Files.writeString(source,"public class RuntimePlugin { public int evaluate(int value) { return value * 7; } }");JavaCompiler compiler=ToolProvider.getSystemJavaCompiler();int compiled=compiler.run(null,null,null,"-g","-d",dir.toString(),source.toString());if(compiled!=0)throw new IllegalStateException("dynamic compilation failed");
  try(IsolatedLoader loader=new IsolatedLoader(dir.toUri().toURL())){Class<?> type=Class.forName("RuntimePlugin",true,loader);Object plugin=type.getDeclaredConstructor().newInstance();int result=(Integer)type.getMethod("evaluate",int.class).invoke(plugin,6);System.out.println(result+":"+(type.getClassLoader()==loader));}
 }
}
