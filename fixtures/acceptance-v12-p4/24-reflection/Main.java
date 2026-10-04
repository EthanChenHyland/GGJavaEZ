import java.lang.reflect.*;
public class Main {
 static class Scale {int multiplier;Scale(int multiplier){this.multiplier=multiplier;}public int apply(int value){return value*multiplier;}}
 public static void main(String[] args)throws Exception{Class<?> type=Class.forName("Main$Scale");Constructor<?> constructor=type.getDeclaredConstructor(int.class);Object scale=constructor.newInstance(6);Method apply=type.getMethod("apply",int.class);int result=(Integer)apply.invoke(scale,7);System.out.println(result);}
}
