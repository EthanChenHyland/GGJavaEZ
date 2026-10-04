public class Main {
 static String echo(String text){return text;}
 public static void main(String[] args){String text=new String("harbor\u0000\u03A9");String alias=text;String returned=echo(alias);String equalCopy=new String(text);System.out.println((text==alias)+":"+(text==returned)+":"+(text==equalCopy)+":"+text.length()+":"+text.equals(equalCopy));}
}
