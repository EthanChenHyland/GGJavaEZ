package cargo;
import org.apache.commons.lang3.StringUtils;
public class Main {
 static String normalize(String text){return StringUtils.capitalize(StringUtils.trim(text));}
 public static void main(String[] args){String result=normalize("  cargo  ");System.out.println(result+":"+StringUtils.countMatches("a:b:c",":"));}
}
