public class Main {
 static void retain(long max,long min,long exact,float fnan,float finf,float fnegative,float fzero,double dnan,double dinf,double dnegative,double dzero,char unicode,char surrogate,boolean yes){System.out.println(max+":"+min+":"+exact+":"+Float.floatToRawIntBits(fzero)+":"+Double.doubleToRawLongBits(dzero)+":"+(int)unicode+":"+(int)surrogate+":"+yes);}
 public static void main(String[] args){retain(Long.MAX_VALUE,Long.MIN_VALUE,9007199254740993L,Float.NaN,Float.POSITIVE_INFINITY,Float.NEGATIVE_INFINITY,-0.0f,Double.NaN,Double.POSITIVE_INFINITY,Double.NEGATIVE_INFINITY,-0.0d,'\u5B57','\uDFFF',true);}
}
