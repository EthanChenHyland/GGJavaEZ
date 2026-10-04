public class Main {
 enum Stage {QUEUED,LOADING,SHIPPED}
 public static void main(String[] args){Stage chosen=Stage.LOADING;Stage alias=Stage.valueOf("LOADING");Stage[] stages=Stage.values();Stage fromArray=stages[1];System.out.println((chosen==alias)+":"+(chosen==fromArray)+":"+chosen.ordinal()+":"+stages.length);}
}
