public class Main {
 static class Channel {int rate;Channel(int rate){this.rate=rate;}int doubled(){return rate*2;}}
 public static void main(String[] args){Channel channel=new Channel(13);int rate=channel.doubled();System.out.println(rate);}
}
